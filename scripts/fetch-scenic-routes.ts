import fs from "fs";

const BBOX = "39.2,-77.7,39.75,-77.15";

const QUERY = `
[out:json][timeout:25];
(
  relation["route"="hiking"]["name"~"Appalachian Trail"](${BBOX});
  relation["network"="US:MD:Scenic"](${BBOX});
  relation["name"~"Historic National Road|Hallowed Ground"](${BBOX});
);
out geom;
`;

const ENDPOINTS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

async function main() {
  for (const endpoint of ENDPOINTS) {
    try {
      console.log(`Trying ${endpoint}...`);
      const res = await fetch(endpoint, {
        method: "POST",
        body: `data=${encodeURIComponent(QUERY)}`,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });
      if (res.ok) {
        const data = await res.json();
        fs.writeFileSync("scenic_routes_raw.json", JSON.stringify(data, null, 2));
        console.log(`Saved ${data.elements.length} elements to scenic_routes_raw.json`);
        return;
      }
      console.error(`Failed with status ${res.status}`);
    } catch (e) {
      console.log(`Error ${endpoint}: ${(e as Error).message}`);
    }
  }
}

main().catch(console.error);
