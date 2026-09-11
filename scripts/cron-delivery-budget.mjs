#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

// Deliberate current ceiling. Removing or slowing a cron creates headroom;
// adding deliveries requires an explicit review of this baseline rather than
// silently increasing Vercel invocation volume.
export const CRON_DELIVERY_BUDGET = Object.freeze({
  definitions: 20,
  weekly: 4_474,
  peakDay: 640,
});

function values(field, min, max, normalizeSunday = false) {
  const output = new Set();
  for (const token of field.split(",")) {
    const [base, rawStep] = token.split("/");
    const step = rawStep === undefined ? 1 : Number(rawStep);
    if (!Number.isInteger(step) || step <= 0) {
      throw new Error(`Unsupported cron step: ${token}`);
    }
    let start = min;
    let end = max;
    if (base !== "*") {
      if (base.includes("-")) {
        [start, end] = base.split("-").map(Number);
      } else {
        start = Number(base);
        end = start;
      }
    }
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < min ||
      end > max ||
      start > end
    ) {
      throw new Error(`Unsupported cron field: ${field}`);
    }
    for (let value = start; value <= end; value += step) {
      output.add(normalizeSunday && value === 7 ? 0 : value);
    }
  }
  return output;
}

function compile(schedule) {
  const fields = schedule.trim().split(/\s+/);
  if (fields.length !== 5) throw new Error(`Expected five cron fields: ${schedule}`);
  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;
  return {
    minute: values(minute, 0, 59),
    hour: values(hour, 0, 23),
    dayOfMonth: values(dayOfMonth, 1, 31),
    month: values(month, 1, 12),
    dayOfWeek: values(dayOfWeek, 0, 7, true),
    dayOfMonthWildcard: dayOfMonth === "*",
    dayOfWeekWildcard: dayOfWeek === "*",
  };
}

function matches(compiled, date) {
  const base =
    compiled.minute.has(date.getUTCMinutes()) &&
    compiled.hour.has(date.getUTCHours()) &&
    compiled.month.has(date.getUTCMonth() + 1);
  if (!base) return false;
  const dom = compiled.dayOfMonth.has(date.getUTCDate());
  const dow = compiled.dayOfWeek.has(date.getUTCDay());
  if (!compiled.dayOfMonthWildcard && !compiled.dayOfWeekWildcard) {
    return dom || dow;
  }
  return dom && dow;
}

export function summarizeCronDeliveries(crons) {
  const compiled = crons.map((cron) => ({
    ...cron,
    compiled: compile(cron.schedule),
    weekly: 0,
  }));
  // 2026-08-23 is a Sunday. A full UTC week captures weekly schedules and the
  // exact delivery count without pretending every day is Monday.
  const start = Date.UTC(2026, 7, 23, 0, 0, 0);
  const byDay = Array.from({ length: 7 }, () => 0);
  for (let offset = 0; offset < 7 * 24 * 60; offset += 1) {
    const date = new Date(start + offset * 60_000);
    const day = Math.floor(offset / (24 * 60));
    for (const cron of compiled) {
      if (!matches(cron.compiled, date)) continue;
      cron.weekly += 1;
      byDay[day] += 1;
    }
  }
  const weekly = byDay.reduce((sum, count) => sum + count, 0);
  return {
    definitions: crons.length,
    weekly,
    averageDay: weekly / 7,
    peakDay: Math.max(...byDay),
    byDay,
    byPath: compiled
      .map(({ path, schedule, weekly: count }) => ({ path, schedule, weekly: count }))
      .sort((a, b) => b.weekly - a.weekly || a.path.localeCompare(b.path)),
  };
}

export function auditCronDeliveryBudget(config) {
  const summary = summarizeCronDeliveries(config.crons ?? []);
  const failures = [];
  if (summary.definitions > CRON_DELIVERY_BUDGET.definitions) {
    failures.push(`definitions ${summary.definitions} > ${CRON_DELIVERY_BUDGET.definitions}`);
  }
  if (summary.weekly > CRON_DELIVERY_BUDGET.weekly) {
    failures.push(`weekly deliveries ${summary.weekly} > ${CRON_DELIVERY_BUDGET.weekly}`);
  }
  if (summary.peakDay > CRON_DELIVERY_BUDGET.peakDay) {
    failures.push(`peak-day deliveries ${summary.peakDay} > ${CRON_DELIVERY_BUDGET.peakDay}`);
  }
  return { summary, failures };
}

function main() {
  const config = JSON.parse(readFileSync(resolve("vercel.json"), "utf8"));
  const { summary, failures } = auditCronDeliveryBudget(config);
  console.log("\nVercel cron delivery budget\n");
  console.log(`  definitions: ${summary.definitions} / ${CRON_DELIVERY_BUDGET.definitions}`);
  console.log(`  weekly:     ${summary.weekly.toLocaleString()} / ${CRON_DELIVERY_BUDGET.weekly.toLocaleString()}`);
  console.log(`  average:    ${summary.averageDay.toFixed(1)} per day`);
  console.log(`  peak day:   ${summary.peakDay} / ${CRON_DELIVERY_BUDGET.peakDay}`);
  console.log("\n  largest schedules:");
  for (const row of summary.byPath.slice(0, 8)) {
    console.log(`    ${String(row.weekly).padStart(4)} / week  ${row.path}`);
  }
  if (failures.length > 0) {
    console.error("\nCron delivery budget exceeded:");
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
  } else {
    console.log("\nNo cron delivery growth. Disabled feature flags may still incur these Vercel invocations.\n");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
