import {
  auditSpatialPlaceMirror,
  syncSpatialPlaceMirror,
} from "@/lib/spatial/place-mirror";
import { closeDb } from "@/lib/db/client";

async function main() {
  const apply = process.argv.includes("--apply");
  const result = apply
    ? await syncSpatialPlaceMirror()
    : await auditSpatialPlaceMirror();
  console.log(JSON.stringify({ mode: apply ? "apply" : "audit", ...result }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(closeDb);
