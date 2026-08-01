import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import {
  classifyDataTools,
  renderDataToolStatus,
} from "./lib/data-tool-status";

config({
  path: [
    resolve(process.cwd(), ".env.local"),
    resolve(process.cwd(), ".env"),
  ],
  quiet: true,
});

type VercelConfiguration = {
  crons?: Array<{ path?: string; schedule?: string }>;
};

function scheduledRoutes(): Map<string, string> {
  const file = resolve(process.cwd(), "vercel.json");
  const parsed = JSON.parse(readFileSync(file, "utf8")) as VercelConfiguration;
  return new Map(
    (parsed.crons ?? [])
      .filter(
        (cron): cron is { path: string; schedule: string } =>
          Boolean(cron.path && cron.schedule),
      )
      .map((cron) => [cron.path, cron.schedule]),
  );
}

const statuses = classifyDataTools(process.env, scheduledRoutes());

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ tools: statuses }, null, 2));
} else {
  console.log(renderDataToolStatus(statuses));
}
