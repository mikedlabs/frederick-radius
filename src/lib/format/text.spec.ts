import { describe, expect, it } from "vitest";
import {
  cleanBlurbFragment,
  cleanFeedText,
  formatAddress,
  repairApostropheSuffix,
  tidyListSeparators,
  titleCaseName,
} from "./text";

// The three real fragment classes the 2026-07 UX audit found in the DFP
// blurbs (QW-14) — each case below is a shipped offender, verbatim.
describe("cleanBlurbFragment", () => {
  it("restores a name-stripped copula fragment", () => {
    expect(
      cleanBlurbFragment("is a family-owned and operated poly furniture & design boutique"),
    ).toBe("A family-owned and operated poly furniture & design boutique");
  });

  it("strips domain-tail + phone debris before the real sentence", () => {
    expect(
      cleanBlurbFragment("com 301-266- Peaceful Massage Studio in the heart of Downtown Frederick"),
    ).toBe("Peaceful Massage Studio in the heart of Downtown Frederick");
  });

  it("sentence-cases a lowercase template fragment", () => {
    expect(cleanBlurbFragment("museum in downtown Frederick.")).toBe(
      "Museum in downtown Frederick.",
    );
  });

  it("is a no-op on clean sentences", () => {
    const s = "Thurmont fixture since 1929. Every president since FDR has eaten here.";
    expect(cleanBlurbFragment(s)).toBe(s);
    // "Is" as a real sentence opener (rare but legal) is left alone…
    // (starts uppercase, so no rule fires)
    expect(cleanBlurbFragment("Island vibes on Market Street.")).toBe(
      "Island vibes on Market Street.",
    );
  });
});

describe("formatAddress", () => {
  it.each(["Entrance", "Suite", "Floor", "Room", "Building", "Unit"])(
    "repairs a %s identifier merged into its postal locality at the shared boundary",
    (kind) => {
      expect(formatAddress(`350 Montevue Lane ${kind} BFrederick`)).toBe(
        `350 Montevue Lane, ${kind} B, Frederick`,
      );
    },
  );

  it("preserves a real sublocation name that is not a postal locality", () => {
    expect(formatAddress("350 Montevue Lane Entrance Barlow")).toBe(
      "350 Montevue Lane, Entrance Barlow",
    );
  });

  it("repairs a civic room identifier concatenated into the locality", () => {
    expect(
      formatAddress("140 W Patrick Street Conference Room CFrederick"),
    ).toBe("140 W Patrick Street, Conference Room C, Frederick");
    expect(formatAddress("12 E Church St.Frederick, MD21701")).toBe(
      "12 E Church St., Frederick, MD 21701",
    );
  });

  it.each(["Market Street Building", "Market Street Unit", "Market Street Conference Room"])(
    "preserves the non-address venue %s",
    (name) => expect(formatAddress(name)).toBe(name),
  );

  it("does not split an ordinary venue phrase", () => {
    expect(formatAddress("Market Street Stage")).toBe("Market Street Stage");
  });
});

// Production rendered "Worman'S Mill Park", "Crampton'S Gap" and "D'S
// Delights": a regex word boundary treats the letter after an apostrophe as
// the start of a word.
describe("titleCaseName", () => {
  it.each([
    ["WORMAN'S MILL PARK", "Worman's Mill Park"],
    ["CRAMPTON'S GAP", "Crampton's Gap"],
    ["WORMAN’S MILL PARK", "Worman’s Mill Park"],
    ["O'NEILL'S FIELD", "O'Neill's Field"],
    [
      "C&O CANAL NATIONAL HISTORICAL PARK (FREDERICK SEGMENTS)",
      "C&O Canal National Historical Park (Frederick Segments)",
    ],
    ["FOUNTAIN ROCK PARK & NATURE CENTER", "Fountain Rock Park & Nature Center"],
    ["NEIGHBORHOOD PARK", "Neighborhood Park"],
    ["BUB-B-QUE/CATERING", "Bub-B-Que/Catering"],
    ["1ST STREET PARK", "1st Street Park"],
    ["FRIENDS OF THE WATERSHED", "Friends of the Watershed"],
    ["THE POINT AT BRUNSWICK", "The Point at Brunswick"],
  ])("renders %s as %s", (raw, expected) => {
    expect(titleCaseName(raw)).toBe(expected);
  });
});

describe("repairApostropheSuffix", () => {
  it("lowers a capitalised possessive or contraction suffix", () => {
    expect(repairApostropheSuffix("D'S Delights")).toBe("D's Delights");
    expect(repairApostropheSuffix("Mayta'S Peruvian")).toBe("Mayta's Peruvian");
    expect(repairApostropheSuffix("Don'T Miss It")).toBe("Don't Miss It");
  });

  it("lowers the suffix after an accented letter too", () => {
    expect(repairApostropheSuffix("José'S Tacos")).toBe("José's Tacos");
    expect(repairApostropheSuffix("Zoë’S Kitchen")).toBe("Zoë’s Kitchen");
    expect(titleCaseName("JOSÉ'S TACOS")).toBe("José's Tacos");
  });

  it("leaves surnames and quoted letters alone", () => {
    expect(repairApostropheSuffix("O'Neill's Rock 'N' Roll")).toBe(
      "O'Neill's Rock 'N' Roll",
    );
    expect(repairApostropheSuffix("D'Angelo O'Donnell")).toBe("D'Angelo O'Donnell");
  });
});

describe("tidyListSeparators", () => {
  it("repairs a dash-bulleted list after cleanFeedText", () => {
    const published =
      "*The following programs will be OPEN: \n— Infants &amp; Toddlers Program\n— School Based Programs\n— School Health Services";
    expect(tidyListSeparators(cleanFeedText(published))).toBe(
      "*The following programs will be OPEN: Infants & Toddlers Program, School Based Programs, School Health Services",
    );
  });

  it("closes the space a spaced aside leaves before its comma", () => {
    expect(
      tidyListSeparators(cleanFeedText("The office — which reopened Monday — is closed.")),
    ).toBe("The office, which reopened Monday, is closed.");
  });

  it("never opens or closes the text with a comma", () => {
    expect(tidyListSeparators(cleanFeedText("— First item — Second item —"))).toBe(
      "First item, Second item",
    );
  });

  it("keeps the comma that follows an abbreviation", () => {
    const address = "12 E Church St., Frederick, MD 21701";
    expect(tidyListSeparators(address)).toBe(address);
    expect(tidyListSeparators("1,200 residents, 3 shelters")).toBe(
      "1,200 residents, 3 shelters",
    );
  });
});
