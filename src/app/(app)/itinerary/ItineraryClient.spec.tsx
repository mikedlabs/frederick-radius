// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const edge=vi.hoisted(() => ({items: [] as {id:string; added_at:string}[], remove:vi.fn()}));
vi.mock("@/hooks/useItinerary", () => ({useItineraryList:() => edge.items, useRemoveItinerary:() => edge.remove}));
vi.mock("@/components/event/EventCard", () => ({default:({event}:{event:{title:string}}) => createElement("span",null,event.title)}));
vi.mock("@/components/map/AppMapClient", () => ({default:() => null}));
vi.mock("next/link", () => ({default:({children,...props}:Record<string,unknown>) => createElement("a",props,children as ReactNode)}));
import ItineraryClient from "./ItineraryClient";
let root:Root; let container:HTMLDivElement; let fetchMock:ReturnType<typeof vi.fn>;
const full=(row:Record<string,unknown>)=>({ends_at:"2026-10-08T22:00:00Z",venue_name:"Memorial Park",category:"music",description:"",audience:[],...row});
const result=(events:unknown[]=[], extra:Record<string,unknown>={}) => new Response(JSON.stringify({events:events.map(row=>full(row as Record<string,unknown>)),resolvedSlugs:[],unresolvedSlugs:[],missingSlugs:[],degraded:false,...extra}));
beforeEach(() => {
 (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 edge.items=[{id:"legacy-event",added_at:"2026-10-06T20:00:00Z"}]; edge.remove.mockReset();
 container=document.createElement("div");document.body.append(container);root=createRoot(container);
 fetchMock=vi.fn();vi.stubGlobal("fetch",fetchMock);
});
afterEach(async () => {await act(async () => root.unmount());container.remove();vi.useRealTimers();vi.unstubAllGlobals();});
async function mount(){await act(async()=>root.render(createElement(ItineraryClient)));}
it("shows recovery rather than a blank timeline after a failed lookup with retained local refs",async()=>{
 fetchMock.mockResolvedValue(new Response(JSON.stringify({error:"source-unavailable"}),{status:503}));
 await mount();
 expect(container.textContent).toMatch(/could not|couldn't|unavailable/i);
 expect(container.querySelector('button')?.textContent).not.toBeNull();
 expect(edge.items[0].id).toBe("legacy-event");
});
it("uses the existing bounded JSON POST for 100 long event identities",async()=>{
 edge.items=Array.from({length:100},(_,i)=>({id:`event-${i}-`+"a".repeat(185),added_at:"2026-10-06T20:00:00Z"}));
 fetchMock.mockResolvedValue(result());await mount();
 const [url,init]=fetchMock.mock.calls[0] as [string,RequestInit];
 expect(url).toBe("/api/events/by-slugs");expect(init.method).toBe("POST");
 expect(JSON.parse(String(init.body)).slugs).toHaveLength(100);
});
it("labels wholly unresolved degraded results without calling the collection empty",async()=>{
 fetchMock.mockResolvedValue(result([],{degraded:true,unresolvedSlugs:["legacy-event"]}));await mount();
 expect(container.textContent).toMatch(/could not|couldn't|unverified|unresolved/i);
 expect(container.textContent).not.toContain("Your day plan is empty");
 expect(edge.items[0].id).toBe("legacy-event");
});
it("removes the saved alias instead of adding the resolver's canonical identity",async()=>{
 const event={slug:"canonical-event",title:"Exact current event",starts_at:"2026-10-08T20:00:00Z",geom:{lng:-77.41,lat:39.41}};
 fetchMock.mockResolvedValue(result([event],{resolvedSlugs:[{requestedSlug:"legacy-event",canonicalSlug:"canonical-event"}]}));await mount();
 const remove=container.querySelector('button[aria-label="Remove Exact current event from Day Plan"]') as HTMLButtonElement;
 await act(async()=>remove.click());expect(edge.remove).toHaveBeenCalledWith(["legacy-event"]);
});

it("control: resolves a healthy current row without a recovery error",async()=>{
 const event={slug:"legacy-event",title:"Healthy current event",starts_at:"2026-10-08T20:00:00Z",geom:{lng:-77.41,lat:39.41}};
 fetchMock.mockResolvedValue(result([event],{resolvedSlugs:[{requestedSlug:event.slug,canonicalSlug:event.slug}]}));await mount();
 expect(container.textContent).toContain(event.title);expect(container.textContent).toContain("1 saved event");
});
it("control: genuinely empty local storage needs no source lookup",async()=>{
 edge.items=[];await mount();expect(container.textContent).toContain("Your day plan is empty");expect(fetchMock).not.toHaveBeenCalled();
});
it("releases a nonempty lookup whose response body never finishes",async()=>{
 vi.useFakeTimers();fetchMock.mockResolvedValue({ok:true,json:()=>new Promise(()=>{})});await mount();
 await act(async()=>vi.advanceTimersByTimeAsync(60_000));
 expect(container.querySelectorAll(".shimmer")).toHaveLength(0);
 expect(container.textContent).toMatch(/could not|couldn't|unavailable/i);
});
it("does not let an obsolete lookup restore a removed event",async()=>{
 let finishOld:(value:Response)=>void=()=>{};
 fetchMock.mockReturnValueOnce(new Promise<Response>(resolve=>{finishOld=resolve;}));await mount();
 edge.items=[{id:"new-event",added_at:"2026-10-06T20:00:00Z"}];
 const current={slug:"new-event",title:"Current chosen event",starts_at:"2026-10-08T20:00:00Z",geom:{lng:-77.41,lat:39.41}};
 fetchMock.mockResolvedValue(result([current],{resolvedSlugs:[{requestedSlug:"new-event",canonicalSlug:"new-event"}]}));
 await act(async()=>root.render(createElement(ItineraryClient)));
 expect(container.textContent).toContain(current.title);
 await act(async()=>finishOld(result([{...current,slug:"legacy-event",title:"Obsolete event"}],{resolvedSlugs:[{requestedSlug:"legacy-event",canonicalSlug:"legacy-event"}]})));
 expect(container.textContent).toContain(current.title);expect(container.textContent).not.toContain("Obsolete event");
});
it("retains useful rows after refresh failure and labels them last-known in both views",async()=>{
 const event={slug:"legacy-event",title:"Previously listed event",starts_at:"2026-10-08T20:00:00Z",geom:{lng:-77.41,lat:39.41}};
 fetchMock.mockResolvedValueOnce(result([event],{resolvedSlugs:[{requestedSlug:event.slug,canonicalSlug:event.slug}]}));await mount();
 fetchMock.mockResolvedValueOnce(new Response("{}",{status:503}));
 await act(async()=>Array.from(container.querySelectorAll("button")).find(b=>b.textContent==="Check again")!.click());
 expect(container.textContent).toContain(event.title);expect(container.textContent).toContain("Last-known event");
 await act(async()=>Array.from(container.querySelectorAll("button")).find(b=>b.textContent==="Map")!.click());
 expect(container.textContent).toContain("Last-known events are shown");expect(container.textContent).toContain("could not be checked");
});
it("does not retain a previous title after a healthy missing/private boundary result",async()=>{
 const event={slug:"legacy-event",title:"Previously public title",starts_at:"2026-10-08T20:00:00Z",geom:{lng:-77.41,lat:39.41}};
 fetchMock.mockResolvedValueOnce(result([event],{resolvedSlugs:[{requestedSlug:event.slug,canonicalSlug:event.slug}]}));await mount();
 fetchMock.mockResolvedValueOnce(result([],{missingSlugs:["legacy-event"]}));
 await act(async()=>Array.from(container.querySelectorAll("button")).find(b=>b.textContent==="Check again")!.click());
 expect(container.textContent).not.toContain(event.title);expect(container.textContent).not.toContain("legacy-event");
 expect(container.textContent).toContain("no longer publicly listed");expect(edge.remove).not.toHaveBeenCalled();
});
it("deduplicates a canonical row but removes both exact stored aliases",async()=>{
 edge.items.push({id:"second-alias",added_at:"2026-10-06T21:00:00Z"});
 const event={slug:"canonical-event",title:"One public listing",starts_at:"2026-10-08T20:00:00Z"};
 fetchMock.mockResolvedValue(result([event],{resolvedSlugs:edge.items.map(i=>({requestedSlug:i.id,canonicalSlug:event.slug}))}));await mount();
 expect(container.textContent?.match(/One public listing/g)).toHaveLength(1);
 await act(async()=>(container.querySelector('button[aria-label="Remove One public listing from Day Plan"]') as HTMLButtonElement).click());
 expect(edge.remove.mock.calls).toEqual([[["legacy-event", "second-alias"]]]);
});
it("keeps overflow references without a second publisher batch",async()=>{
 edge.items=Array.from({length:102},(_,i)=>({id:`event-${i}`,added_at:"2026-10-06T20:00:00Z"}));fetchMock.mockResolvedValue(result());await mount();
 expect(fetchMock).toHaveBeenCalledTimes(1);expect(JSON.parse(fetchMock.mock.calls[0][1].body).slugs).toHaveLength(100);
 expect(container.textContent).toContain("2 other saved references are kept");expect(edge.items).toHaveLength(102);
});
it("aborts the actual lookup on unmount",async()=>{
 fetchMock.mockReturnValue(new Promise(()=>{}));await mount();const signal=fetchMock.mock.calls[0][1].signal;
 await act(async()=>root.render(null));expect(signal.aborted).toBe(true);
});
