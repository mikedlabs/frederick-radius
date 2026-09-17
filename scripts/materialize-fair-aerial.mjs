/** One reviewed, self-hosted aerial. Never run as part of an application build. */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const service = "https://mdgeodata.md.gov/imagery/rest/services/SixInch/SixInchImagery/ImageServer";
const catalog = "https://www.arcgis.com/sharing/rest/content/items/7ff8fee809dd4afcab7fbea0916e4ebe";
const destination = new URL("../public/data/fair/aerial/", import.meta.url);
const mercator = (longitude, latitude) => [
  longitude * Math.PI / 180 * 6378137,
  Math.log(Math.tan(Math.PI / 4 + latitude * Math.PI / 360)) * 6378137,
];
const geographic = (x, y) => [
  x / 6378137 * 180 / Math.PI,
  (2 * Math.atan(Math.exp(y / 6378137)) - Math.PI / 2) * 180 / Math.PI,
];
async function read(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`${response.status} from ${new URL(url).hostname}`);
  return response;
}

const catalogRaw = await (await read(`${catalog}?f=json`)).text();
const item = JSON.parse(catalogRaw);
if (item.url !== service || !item.licenseInfo?.includes("freely distributed")) {
  throw new Error("The reviewed service or redistribution terms changed. Review before downloading.");
}
const metadata = await (await read(`${catalog}/info/metadata/metadata.xml`)).text();
const serviceRaw = await (await read(`${service}?f=pjson`)).text();
if (!/2025[^<]*Frederick/.test(serviceRaw)) {
  throw new Error("The service no longer identifies Frederick as 2025 coverage. Review the imagery year before replacing this snapshot.");
}
const bbox = [...mercator(-77.4045, 39.4065), ...mercator(-77.385, 39.4205)];
const parameters = new URLSearchParams({
  bbox: bbox.join(","), bboxSR: "3857", imageSR: "3857", size: "2560,2560",
  format: "jpg", compressionQuality: "85", f: "json",
});
const exportUrl = `${service}/exportImage?${parameters}`;
const exported = await (await read(exportUrl)).json();
if (!exported.href || new URL(exported.href).origin !== new URL(service).origin || !exported.extent) {
  throw new Error("Imagery export did not return a same-origin image and georeferencing.");
}
const image = Buffer.from(await (await read(exported.href)).arrayBuffer());
if (image[0] !== 0xff || image[1] !== 0xd8 || image.length > 3_000_000) {
  throw new Error("Unexpected image format or image exceeds the bounded 3 MB download budget.");
}
const { xmin, ymin, xmax, ymax } = exported.extent;
const provenance = {
  publisher: "State of Maryland, MD iMAP, DoIT", imageryYear: 2025,
  downloadedAt: new Date().toISOString(), service, catalog, exportUrl,
  file: "frederick-fairgrounds-2025.jpg", bytes: image.length,
  sha256: createHash("sha256").update(image).digest("hex"),
  coordinates: [geographic(xmin, ymax), geographic(xmax, ymax), geographic(xmax, ymin), geographic(xmin, ymin)],
  extent: exported.extent, width: exported.width, height: exported.height,
  note: "Aerial background only. Does not represent the 2026 temporary event layout. Original source catalog, service metadata, and attribution are preserved alongside the image.",
};
await mkdir(destination, { recursive: true });
await writeFile(new URL(provenance.file, destination), image);
await writeFile(new URL("source-catalog.json", destination), catalogRaw);
await writeFile(new URL("source-metadata.xml", destination), metadata);
await writeFile(new URL("source-service.json", destination), serviceRaw);
await writeFile(new URL("provenance.json", destination), JSON.stringify(provenance, null, 2) + "\n");
console.log(JSON.stringify({ directory: fileURLToPath(destination), ...provenance }, null, 2));
