import { it as test, vi } from "vitest";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { withBusinessInfoRunLock } from "../scripts/lib/business-info-run-lock";
import { main as nativeMain } from "../scripts/refresh-official-commerce-links";

function fixture() { const dir = mkdtempSync(join(tmpdir(), "radius-lock-test-")), root = join(dir, "checkout"), hold = join(dir, "hold"); mkdirSync(root); mkdirSync(join(root,"src")); mkdirSync(join(root,"src/data")); mkdirSync(hold); execFileSync("git",["init","-q",root]); const target = join(root,"src/data/business-info.json"); writeFileSync(target,'{"old":{"name":"Kept","commerce_links":[{"url":"https://one.example/menu"}],"commerce_source":{"checkedAt":"2026-10-01"}}}\n'); return {dir,root,hold,target}; }
const candidate = { old: { name:"Kept", commerce_links:[{url:"https://one.example/menu"}], commerce_source:{checkedAt:"2026-10-01"} }, "new-place": {name:"New"} };
test("lock serializes a whole run; the rejected second run makes no provider calls", async () => {
 const f=fixture(); const old=process.env.BUSINESS_INFO_CONFLICT_PARENT; process.env.BUSINESS_INFO_CONFLICT_PARENT=f.hold;
 let unblock!:()=>void, started!:()=>void; const waiting=new Promise<void>(r=>unblock=r), began=new Promise<void>(r=>started=r); let rejectedProviderCalls=0;
 try { const first=withBusinessInfoRunLock(f.target,async commit=>{started();await waiting;commit(candidate);}); await began;
   await assert.rejects(withBusinessInfoRunLock(f.target,async()=>{rejectedProviderCalls++;}),/EEXIST/); assert.equal(rejectedProviderCalls,0); unblock();await first;
   assert.deepEqual(JSON.parse(readFileSync(f.target,"utf8")),candidate);assert.equal(existsSync(f.target+".review.lock"),false);const dirs=readdirSync(f.hold);assert.equal(dirs.length,1);const result=JSON.parse(readFileSync(join(f.hold,dirs[0],"commit-result.json"),"utf8"));assert.equal(result.state,"committed_local_not_published");assert.equal(result.original_provider_responses_retained,false);
 } finally {if(old===undefined)delete process.env.BUSINESS_INFO_CONFLICT_PARENT;else process.env.BUSINESS_INFO_CONFLICT_PARENT=old;rmSync(f.dir,{recursive:true,force:true});}
});
test("linked worktrees share a lock before either writer can call a provider", async () => {
 const f=fixture();const other=join(f.dir,"other"),old=process.env.BUSINESS_INFO_CONFLICT_PARENT;process.env.BUSINESS_INFO_CONFLICT_PARENT=f.hold;
 execFileSync("git",["-C",f.root,"add","src/data/business-info.json"]);
 execFileSync("git",["-C",f.root,"-c","user.name=Test","-c","user.email=test@example.invalid","commit","-qm","fixture"]);
 execFileSync("git",["-C",f.root,"worktree","add","-q","--detach",other,"HEAD"]);
 const otherTarget=join(other,"src/data/business-info.json");let unblock!:()=>void,started!:()=>void;const waiting=new Promise<void>(r=>unblock=r),began=new Promise<void>(r=>started=r);let calls=0;
 try{const first=withBusinessInfoRunLock(f.target,async()=>{started();await waiting;});await began;
   await assert.rejects(withBusinessInfoRunLock(otherTarget,async()=>{calls++;}),/EEXIST/);assert.equal(calls,0);unblock();await first;
   await withBusinessInfoRunLock(otherTarget,async()=>{calls++;});assert.equal(calls,1);
 }finally{if(old===undefined)delete process.env.BUSINESS_INFO_CONFLICT_PARENT;else process.env.BUSINESS_INFO_CONFLICT_PARENT=old;rmSync(f.dir,{recursive:true,force:true});}
});
test("an interrupted writer leaves the shared lock held rather than silently retrying", async () => {
 const f=fixture(),other=join(f.dir,"other"),loader=join(process.cwd(),"node_modules/tsx/dist/loader.mjs"),modulePath=join(process.cwd(),"scripts/lib/business-info-run-lock.ts");
 execFileSync("git",["-C",f.root,"add","src/data/business-info.json"]);
 execFileSync("git",["-C",f.root,"-c","user.name=Test","-c","user.email=test@example.invalid","commit","-qm","fixture"]);
 execFileSync("git",["-C",f.root,"worktree","add","-q","--detach",other,"HEAD"]);
 const script=`import {withBusinessInfoRunLock} from ${JSON.stringify(modulePath)}; await withBusinessInfoRunLock(${JSON.stringify(f.target)}, async()=>{setInterval(()=>{},1000); console.log('LOCKED'); await new Promise(()=>{});});`;
 const child=spawn(process.execPath,["--import",loader,"--input-type=module","-e",script],{env:{...process.env,BUSINESS_INFO_CONFLICT_PARENT:f.hold},stdio:["ignore","pipe","pipe"]});
 try{await new Promise<void>((resolve,reject)=>{let out="";const timer=setTimeout(()=>reject(new Error("writer did not acquire lock in time")),5000);child.stdout.on("data",chunk=>{out+=chunk;if(out.includes("LOCKED")){clearTimeout(timer);resolve();}});child.once("error",error=>{clearTimeout(timer);reject(error);});child.once("exit",code=>{clearTimeout(timer);reject(new Error(`child exited before locking: ${code}`));});});
   const exited=new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("writer did not exit in time")),5000);child.once("exit",()=>{clearTimeout(timer);resolve();});});
   child.kill("SIGKILL");await exited;let calls=0;
   const otherTarget=join(other,"src/data/business-info.json");await assert.rejects(withBusinessInfoRunLock(otherTarget,async()=>{calls++;}),/EEXIST/);assert.equal(calls,0);assert.equal(existsSync(otherTarget+".review.lock"),false);assert.equal(existsSync(join(f.root,".git","radius-business-info.review.lock")),true);
 }finally{if(child.exitCode===null && child.signalCode===null)child.kill("SIGKILL");rmSync(f.dir,{recursive:true,force:true});}
});
test("a noncooperating change holds the complete derived candidate and keeps its old commerce action/clock", async()=>{
 const f=fixture();const old=process.env.BUSINESS_INFO_CONFLICT_PARENT;process.env.BUSINESS_INFO_CONFLICT_PARENT=f.hold;
 try {await assert.rejects(withBusinessInfoRunLock(f.target,async commit=>{writeFileSync(f.target,'{"concurrent":true}\n');commit(candidate);}),/derived candidate held/);
   assert.equal(readFileSync(f.target,"utf8"),'{"concurrent":true}\n');const dirs=readdirSync(f.hold);assert.equal(dirs.length,1);
   const saved=JSON.parse(readFileSync(join(f.hold,dirs[0],"candidate.json"),"utf8")),receipt=JSON.parse(readFileSync(join(f.hold,dirs[0],"receipt.json"),"utf8"));
   assert.deepEqual(saved,candidate);assert.equal(saved.old.commerce_source.checkedAt,"2026-10-01");assert.equal(saved.old.commerce_links[0].url,"https://one.example/menu");assert.equal(receipt.state,"held_derived_candidate_not_accepted");assert.equal(receipt.original_provider_responses_retained,false);
 } finally {if(old===undefined)delete process.env.BUSINESS_INFO_CONFLICT_PARENT;else process.env.BUSINESS_INFO_CONFLICT_PARENT=old;rmSync(f.dir,{recursive:true,force:true});}
});
test("a missing private hold parent fails before provider work",async()=>{const f=fixture();const old=process.env.BUSINESS_INFO_CONFLICT_PARENT;process.env.BUSINESS_INFO_CONFLICT_PARENT=join(f.dir,"missing");let calls=0;
 try{await assert.rejects(withBusinessInfoRunLock(f.target,async()=>{calls++;}),/ENOENT/);assert.equal(calls,0);assert.equal(existsSync(f.target+".review.lock"),false);}finally{if(old===undefined)delete process.env.BUSINESS_INFO_CONFLICT_PARENT;else process.env.BUSINESS_INFO_CONFLICT_PARENT=old;rmSync(f.dir,{recursive:true,force:true});}
});
test("callback failure releases only its own lock and keeps original bytes",async()=>{const f=fixture();const old=process.env.BUSINESS_INFO_CONFLICT_PARENT;process.env.BUSINESS_INFO_CONFLICT_PARENT=f.hold;
 try{const before=readFileSync(f.target);await assert.rejects(withBusinessInfoRunLock(f.target,async()=>{throw Error("provider failed");}),/provider failed/);assert.deepEqual(readFileSync(f.target),before);assert.equal(existsSync(f.target+".review.lock"),false);}finally{if(old===undefined)delete process.env.BUSINESS_INFO_CONFLICT_PARENT;else process.env.BUSINESS_INFO_CONFLICT_PARENT=old;rmSync(f.dir,{recursive:true,force:true});}
});
test("failure after commit reports already-written state and preserves durable receipts",async()=>{const f=fixture();const old=process.env.BUSINESS_INFO_CONFLICT_PARENT;process.env.BUSINESS_INFO_CONFLICT_PARENT=f.hold;
 try{await assert.rejects(withBusinessInfoRunLock(f.target,async commit=>{commit(candidate);throw Error("later processing failed");}),/already committed/);assert.deepEqual(JSON.parse(readFileSync(f.target,"utf8")),candidate);const dirs=readdirSync(f.hold);assert.equal(dirs.length,1);const dir=join(f.hold,dirs[0]);const prepared=JSON.parse(readFileSync(join(dir,"commit-prepared.json"),"utf8"));const result=JSON.parse(readFileSync(join(dir,"commit-result.json"),"utf8"));const failure=JSON.parse(readFileSync(join(dir,"post-commit-failure.json"),"utf8"));assert.equal(prepared.state,"commit_prepared_outcome_unknown_do_not_retry");assert.equal(result.state,"committed_local_not_published");assert.equal(failure.state,"committed_local_then_callback_failed_do_not_retry");assert.deepEqual(JSON.parse(readFileSync(join(dir,"candidate.json"),"utf8")),candidate);}finally{if(old===undefined)delete process.env.BUSINESS_INFO_CONFLICT_PARENT;else process.env.BUSINESS_INFO_CONFLICT_PARENT=old;rmSync(f.dir,{recursive:true,force:true});}
});
test("a stale staged file stops before any provider call and preserves the older evidence",async()=>{const f=fixture();const old=process.env.BUSINESS_INFO_CONFLICT_PARENT;process.env.BUSINESS_INFO_CONFLICT_PARENT=f.hold;let calls=0;writeFileSync(f.target+".review.tmp","older staged evidence");
 try{await assert.rejects(withBusinessInfoRunLock(f.target,async()=>{calls++;}),/Existing staged/);assert.equal(calls,0);assert.equal(readFileSync(f.target+".review.tmp","utf8"),"older staged evidence");assert.equal(existsSync(f.target+".review.lock"),false);}finally{if(old===undefined)delete process.env.BUSINESS_INFO_CONFLICT_PARENT;else process.env.BUSINESS_INFO_CONFLICT_PARENT=old;rmSync(f.dir,{recursive:true,force:true});}
});
test("real native entrypoint refuses a held lock before invoking fetch",async()=>{const lock=join(process.cwd(),"src/data/business-info.json.review.lock"),fetch=vi.fn();writeFileSync(lock,"other",{flag:"wx"});vi.stubGlobal("fetch",fetch);
 try{await assert.rejects(nativeMain(["--native-daily","--limit=1","--max-follow=0"]),/EEXIST/);assert.equal(fetch.mock.calls.length,0);assert.equal(readFileSync(lock,"utf8"),"other");}finally{vi.unstubAllGlobals();rmSync(lock);}
});
test("real paid entrypoint stops at a held lock before its disabled network can be used",()=>{const root=process.cwd(),lock=join(root,"src/data/business-info.json.review.lock");writeFileSync(lock,"other",{flag:"wx"});
 try{const loader=join(root,"node_modules/tsx/dist/loader.mjs"),guard=join(root,"scripts/promoted-build-network-guard.mjs");const r=spawnSync(process.execPath,["--import",loader,"scripts/ingest-business-info.ts","--limit=1"],{cwd:root,encoding:"utf8",timeout:10000,env:{...process.env,ANTHROPIC_API_KEY:"",FIRECRAWL_API_KEY:"",FIRECRAWL_FETCH_FALLBACK:"0",RADIUS_DATA_MODE:"promoted",NODE_OPTIONS:`--import ${guard}`,PLAYWRIGHT_BROWSERS_PATH:"/nonexistent-radius-test-browsers"}});assert.equal(r.status,1);assert.match(r.stderr,/EEXIST/);assert.doesNotMatch(r.stderr,/External network blocked/);assert.equal(readFileSync(lock,"utf8"),"other");}finally{rmSync(lock);}
});
