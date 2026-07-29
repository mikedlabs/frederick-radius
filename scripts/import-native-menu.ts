#!/usr/bin/env tsx

import { readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import {
  importNativeMenu,
  MAX_NATIVE_MENU_INPUT_BYTES,
  NativeMenuValidationError,
  type NativeMenuInputFormat,
} from "../src/lib/commerce/native-menu-ingest";

interface Args {
  input?: string;
  output?: string;
  format?: NativeMenuInputFormat;
  dryRun: boolean;
}

function usage(): never {
  console.error(
    [
      "Usage:",
      "  npx tsx scripts/import-native-menu.ts --input menu.json --dry-run",
      "  npx tsx scripts/import-native-menu.ts --input menu.csv --output normalized.json",
      "",
      "Options:",
      "  --input <path>       Restaurant-authorized JSON or CSV",
      "  --format json|csv    Optional; inferred from the extension",
      "  --output <path>      Required unless --dry-run is used",
      "  --dry-run            Validate and print a summary without writing",
    ].join("\n"),
  );
  process.exit(2);
}

function parseArgs(argv: string[]): Args {
  const args: Args = { dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--input") {
      args.input = argv[++index];
    } else if (arg === "--output") {
      args.output = argv[++index];
    } else if (arg === "--format") {
      const format = argv[++index];
      if (format !== "json" && format !== "csv") usage();
      args.format = format;
    } else if (arg === "--help" || arg === "-h") {
      usage();
    } else {
      usage();
    }
  }
  return args;
}

function inferFormat(path: string): NativeMenuInputFormat {
  const extension = extname(path).toLowerCase();
  if (extension === ".json") return "json";
  if (extension === ".csv") return "csv";
  console.error("Cannot infer input format. Add --format json or --format csv.");
  process.exit(2);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input || (!args.dryRun && !args.output)) usage();

  const inputPath = resolve(args.input);
  const size = statSync(inputPath).size;
  if (size > MAX_NATIVE_MENU_INPUT_BYTES) {
    throw new NativeMenuValidationError([
      `input exceeds the ${MAX_NATIVE_MENU_INPUT_BYTES}-byte limit`,
    ]);
  }
  const input = readFileSync(inputPath);
  const menu = importNativeMenu(input, {
    format: args.format ?? inferFormat(inputPath),
  });

  if (args.dryRun) {
    console.log(
      JSON.stringify(
        {
          valid: true,
          dryRun: true,
          placeId: menu.placeId,
          provider: menu.source.provider,
          checkedAt: menu.source.checkedAt,
          totals: menu.totals,
        },
        null,
        2,
      ),
    );
    return;
  }

  writeFileSync(resolve(args.output!), `${JSON.stringify(menu, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  console.log(`Wrote ${menu.totals.items} menu items to ${resolve(args.output!)}`);
}

try {
  main();
} catch (error) {
  if (error instanceof NativeMenuValidationError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}

