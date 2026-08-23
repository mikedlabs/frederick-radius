#!/usr/bin/env tsx

import { readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { closeDb } from "../src/lib/db/client";
import {
  importNativeMenu,
  MAX_NATIVE_MENU_INPUT_BYTES,
  NativeMenuValidationError,
  type NativeMenuInputFormat,
} from "../src/lib/commerce/native-menu-ingest";
import {
  NativeMenuReviewError,
  stageNativeMenuForReview,
} from "../src/lib/commerce/native-menu-review";

interface Args {
  input?: string;
  output?: string;
  format?: NativeMenuInputFormat;
  dryRun: boolean;
  stageReview: boolean;
}

function usage(): never {
  console.error(
    [
      "Usage:",
      "  npx tsx scripts/import-native-menu.ts --input menu.json --dry-run",
      "  npx tsx scripts/import-native-menu.ts --input menu.csv --output normalized.json",
      "  npx tsx scripts/import-native-menu.ts --input menu.json --stage-review",
      "",
      "Options:",
      "  --input <path>       Restaurant-authorized JSON or CSV",
      "  --format json|csv    Optional; inferred from the extension",
      "  --output <path>      Required unless --dry-run is used",
      "  --dry-run            Validate and print a summary without writing",
      "  --stage-review       Store as draft/unverified for human review; never publish",
    ].join("\n"),
  );
  process.exit(2);
}

function parseArgs(argv: string[]): Args {
  const args: Args = { dryRun: false, stageReview: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--stage-review") {
      args.stageReview = true;
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

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const selectedModes =
    Number(args.dryRun) + Number(Boolean(args.output)) + Number(args.stageReview);
  if (!args.input || selectedModes !== 1) usage();

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

  if (args.stageReview) {
    const { publicPlaceBySlug } = await import("../src/lib/loaders/places");
    if (!publicPlaceBySlug(menu.placeId)) {
      throw new NativeMenuReviewError(
        "write_failed",
        `place_id "${menu.placeId}" is not in the current public Radius catalog`,
      );
    }
    const staged = await stageNativeMenuForReview(menu);
    console.log(JSON.stringify(staged, null, 2));
    return;
  }

  writeFileSync(resolve(args.output!), `${JSON.stringify(menu, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  console.log(`Wrote ${menu.totals.items} menu items to ${resolve(args.output!)}`);
}

main()
  .catch((error) => {
    if (
      error instanceof NativeMenuValidationError ||
      error instanceof NativeMenuReviewError
    ) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }
    throw error;
  })
  .finally(async () => {
    await closeDb();
  });
