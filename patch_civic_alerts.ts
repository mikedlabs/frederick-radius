import fs from "fs";

let content = fs.readFileSync("src/components/today/CivicAlerts.tsx", "utf-8");

if (!content.includes("getAirQuality")) {
  content = content.replace(
    `import { getNpsAlerts, type NpsAlert } from "@/lib/integrations/nps";`,
    `import { getNpsAlerts, type NpsAlert } from "@/lib/integrations/nps";\nimport { getAirQuality, pickWorstAqi } from "@/lib/integrations/airnow";\nimport { FREDERICK_CENTER } from "@/lib/geo";`
  );

  content = content.replace(
    `export default async function CivicAlerts() {`,
    `export default async function CivicAlerts() {
  const aqiObs = await getAirQuality(FREDERICK_CENTER).catch(() => null);
  const worstAqi = aqiObs ? pickWorstAqi(aqiObs) : null;
`
  );

  content = content.replace(
    `const alerts = normalize(nws, nps);`,
    `const alerts = normalize(nws, nps);
  
  if (worstAqi && worstAqi.category.id >= 3) {
    alerts.unshift({
      source: "EPA",
      severity: worstAqi.category.id >= 4 ? "warning" : "advisory",
      title: \`Air Quality: \${worstAqi.category.name}\`,
      tail: \`AQI is \${worstAqi.aqi}. Limit prolonged outdoor exertion.\`,
      scope: "Frederick Area",
      url: "https://www.airnow.gov/"
    });
  }`
  );

  fs.writeFileSync("src/components/today/CivicAlerts.tsx", content);
  console.log("Patched CivicAlerts.tsx with AirQuality");
} else {
  console.log("Already patched");
}
