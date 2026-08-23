#!/usr/bin/env tsx

import { closeDb } from "../src/lib/db/client";
import {
  listNativeMenuReviewCandidates,
  NativeMenuReviewError,
} from "../src/lib/commerce/native-menu-review";

async function main(): Promise<void> {
  const candidates = await listNativeMenuReviewCandidates();
  console.log(
    JSON.stringify(
      {
        reviewRequired: true,
        publiclyVisible: false,
        candidates: candidates.length,
        rows: candidates,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    if (error instanceof NativeMenuReviewError) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }
    throw error;
  })
  .finally(async () => {
    await closeDb();
  });
