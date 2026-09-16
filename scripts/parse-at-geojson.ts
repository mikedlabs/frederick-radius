import fs from "fs";

function parse() {
  const data = JSON.parse(fs.readFileSync("at_result.json", "utf-8"));
  const features = [];
  for (const element of data.elements) {
    if (element.type === "relation" && element.members) {
      for (const member of element.members) {
        if (member.type === "way" && member.geometry) {
          features.push({
            type: "Feature",
            geometry: {
              type: "LineString",
              coordinates: member.geometry.map((g: { lon: number; lat: number }) => [g.lon, g.lat])
            },
            properties: {
              name: element.tags?.name || "Appalachian Trail",
              network: element.tags?.network,
            }
          });
        }
      }
    } else if (element.type === "way" && element.geometry) {
      features.push({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: element.geometry.map((g: { lon: number; lat: number }) => [g.lon, g.lat])
        },
        properties: {
          name: element.tags?.name || "Appalachian Trail",
          network: element.tags?.network,
        }
      });
    }
  }
  const geojson = { type: "FeatureCollection", features };
  fs.mkdirSync("src/data", { recursive: true });
  fs.writeFileSync("src/data/appalachian-trail.json", JSON.stringify(geojson));
  console.log(`Saved ${features.length} features to src/data/appalachian-trail.json`);
}

parse();
