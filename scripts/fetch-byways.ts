import fs from "fs";

const BBOX = "39.2,-77.7,39.75,-77.15";

const QUERIES = [
  {
    name: "Historic National Road",
    query: `[out:json][timeout:25];(relation["name"~"Historic National Road|National Road"](${BBOX}););out geom;`
  },
  {
    name: "Hallowed Ground",
    query: `[out:json][timeout:25];(relation["name"~"Hallowed Ground"](${BBOX}););out geom;`
  }
];

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchWithRetry(query: string) {
  for (let i = 0; i < 5; i++) {
    for (const endpoint of ENDPOINTS) {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          body: `data=${encodeURIComponent(query)}`,
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        });
        if (res.ok) {
          return await res.json();
        }
        console.log(`Failed ${endpoint} with ${res.status}`);
      } catch (e) {
        console.log(`Error ${endpoint}: ${(e as Error).message}`);
      }
    }
    console.log("Waiting 5s before retry...");
    await delay(5000);
  }
  return null;
}

async function main() {
  const allFeatures = [];

  for (const q of QUERIES) {
    console.log(`Fetching ${q.name}...`);
    const data = await fetchWithRetry(q.query);
    if (!data) {
      console.error(`Failed to fetch ${q.name}`);
      continue;
    }

    let count = 0;
    for (const element of data.elements) {
      if (element.type === "relation" && element.members) {
        for (const member of element.members) {
          if (member.type === "way" && member.geometry) {
            allFeatures.push({
              type: "Feature",
              geometry: {
                type: "LineString",
                coordinates: member.geometry.map((g: { lon: number; lat: number }) => [g.lon, g.lat])
              },
              properties: {
                name: q.name,
              }
            });
            count++;
          }
        }
      } else if (element.type === "way" && element.geometry) {
        allFeatures.push({
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: element.geometry.map((g: { lon: number; lat: number }) => [g.lon, g.lat])
          },
          properties: {
            name: q.name,
          }
        });
        count++;
      }
    }
    console.log(`Parsed ${count} ways for ${q.name}`);
  }

  const geojson = { type: "FeatureCollection", features: allFeatures };
  fs.writeFileSync("src/data/scenic-byways.json", JSON.stringify(geojson));
  console.log(`Saved ${allFeatures.length} total features to src/data/scenic-byways.json`);
}

main().catch(console.error);
