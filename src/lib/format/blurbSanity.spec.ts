import { describe, it, expect } from "vitest";
import { isJunkBlurb, stripRepeatedNamePrefix } from "./blurbSanity";

/**
 * Every junk case below is a SHIPPED offender, verbatim from
 * places-client.json at the 2026-07 audit. Every keep case is either a
 * real curated blurb or real (if imperfect) scraped prose — the
 * conservative contract: a real sentence must never be dropped.
 */
describe("isJunkBlurb — scrape debris is dropped", () => {
  it("kills directory boilerplate ('More info about …')", () => {
    expect(isJunkBlurb("More info about JKW Beauty ; 504 N Market St", "Jkw Beauty")).toBe(true);
    expect(isJunkBlurb("Bailey's Treasures More info about Bailey's Treasures", "Baileys Treasures")).toBe(true);
    expect(isJunkBlurb("More info about Posh Aesthetics", "Posh Aesthetics")).toBe(true);
  });

  it("kills Yelp/directory chrome scraped as if it described the place", () => {
    expect(
      isJunkBlurb(
        "Focus Recovery Center Yelp is a fun and easy way to find, recommend and talk about what's great and not so great in",
        "Focus Recovery Center",
      ),
    ).toBe(true);
    expect(
      isJunkBlurb(
        "Victoria's Oasis See reviews, map, get the address, and find directions",
        "Victorias Oasis",
      ),
    ).toBe(true);
  });

  it("kills Yelp listing dumps (photos + phone + hours)", () => {
    expect(
      isJunkBlurb(
        "MAZAKO AFGHAN EATERY - Try Our New Menu - 911 N E St, Unit B, Frederick, MD 21701, 20 Photos, (240) 575-9256, Mon - Closed, Tue - 11:30 am - 8:00 pm,",
        "Mazako",
      ),
    ).toBe(true);
  });

  it("kills Facebook counters and review counts", () => {
    expect(
      isJunkBlurb("Vital Sources Psychological Services 977 likes · 12 were here", "Vital Sources Psychological Services"),
    ).toBe(true);
    expect(isJunkBlurb("The Station Market and Cafe 4 Reviews", "The Station Market and Cafe")).toBe(true);
  });

  it("kills bare address dumps (with and without the name prefix)", () => {
    expect(
      isJunkBlurb(
        "Noah Stevens 205 Broadway St, Frederick, MD, 21701-6682 205 Broadway St, Frederick, MD 21701, USA",
        "Noah Stevens",
      ),
    ).toBe(true);
    expect(isJunkBlurb("400 West 7th Street Frederick, MD 21701", "Frederick Health Hospital")).toBe(true);
    expect(isJunkBlurb("25 N Market Street · Frederick, MD 21701", "Rare Morsel")).toBe(true);
    expect(isJunkBlurb("West End Laundromat Frederick, MD 21701", "West End Laundromat")).toBe(true);
    expect(isJunkBlurb("Growwith-Abi Frederick , Frederick, MD, 21704", "Growwith Abi")).toBe(true);
    // Doubled address with a dangling unit tail
    expect(
      isJunkBlurb(
        "The Healing Temple 11 W Patrick St Ste 300, Frederick, MD, 21701 11 W Patrick St Ste 300",
        "The Healing Temple",
      ),
    ).toBe(true);
    // "…, USA" glued straight into the next scrape block
    expect(
      isJunkBlurb(
        "DaVita Ballenger Creek Dialysis 5205 Chairmans Ct Ste 101, Frederick, MD, 21703 5205 Chairmans Ct Ste 101, Frederick, MD 21703, USASchedule a Tour",
        "Davita Ballenger Creek Dialysis",
      ),
    ).toBe(true);
  });

  it("kills street fragments and dangling house numbers", () => {
    expect(isJunkBlurb("Maria Hawkins Aesthetics 512 N Market St", "Maria Hawkins Aesthetics")).toBe(true);
    expect(isJunkBlurb("Dancing Bear Toys and Games Patrick St", "Dancing Bear Toys and Games")).toBe(true);
    expect(isJunkBlurb("Ken's Automotive Transmission 371 W", "Kens Automotive Transmission")).toBe(true);
    expect(isJunkBlurb("Quince Orchard Psychotherapy Ste 205", "Quince Orchard Psychotherapy")).toBe(true);
  });

  it("kills the name restated (once or twice) and glyph residue", () => {
    expect(isJunkBlurb("Frederick Sleep Disorders Center", "Frederick Sleep Disorders Center")).toBe(true);
    expect(
      isJunkBlurb("Structural Building Solutions Structural Building Solutions", "Structural Building Solutions"),
    ).toBe(true);
    expect(isJunkBlurb("Verbena Salon & Spa VERBENA SALON & SPA,", "Verbena Salon Spa")).toBe(true);
    expect(isJunkBlurb("City of Frederick Parks and Rec \u{F06CF}", "City of Frederick Parks and Rec")).toBe(true);
  });

  it("kills scraped site navigation", () => {
    expect(isJunkBlurb("· Twitter · Facebook · Instagram", "City Hall")).toBe(true);
    expect(isJunkBlurb("Elite Feet Dance Studio Register · Schedule", "Elite Feet Dance Studio")).toBe(true);
    expect(isJunkBlurb("Brooks Behavioral Health Services, LLC Details", "Brooks Behavioral Health Services LLC")).toBe(true);
  });

  it("kills synthetic directory filler that does not help someone choose", () => {
    expect(isJunkBlurb("Restaurants in Thurmont.", "Some Restaurant")).toBe(true);
    expect(isJunkBlurb("Wellness in Downtown Frederick.", "Some Studio")).toBe(true);
    expect(isJunkBlurb("Local shop in downtown Frederick.", "Some Shop")).toBe(true);
    expect(isJunkBlurb("Park in Frederick County.", "Some Park")).toBe(true);
    expect(isJunkBlurb("Book Stores in Downtown Frederick.", "Some Shop")).toBe(true);
    expect(isJunkBlurb("Yoga & Fitness in Downtown Frederick.", "Some Studio")).toBe(true);
  });

  it("kills address blocks cut mid-email and stripped contact lines", () => {
    expect(isJunkBlurb("228 North Market Street Frederick, MD 21701 hello@7thsister", "7th Sister")).toBe(true);
    expect(isJunkBlurb("Market Street | Frederick, MD 21701 service@scgarage", "Second Chances Garage")).toBe(true);
    expect(
      isJunkBlurb(
        "Gaffar Syed MD Contact us at or visit us at 801 Toll house ave, Suite , H4, Frederick, MD 21701: Gaffar Syed MD",
        "Gaffar Syed MD",
      ),
    ).toBe(true);
  });
});

describe("isJunkBlurb — real blurbs always survive", () => {
  it("keeps curated editorial blurbs", () => {
    for (const [blurb, name] of [
      ["Mile-and-a-quarter of waterway, walking paths, gardens, and seasonal sailboats.", "Carroll Creek Linear Park"],
      ["44-acre downtown park with a band shell, lake, tennis, and the Joseph D. Baker carillon tower.", "Baker Park"],
      ["Downtown's original brewpub. Wood-fired pizza, big burgers, house lagers since 1996.", "Brewer's Alley"],
      ["Cash-only neighborhood pub with the legendary burger and dive-bar warmth on Market.", "The Olde Towne Tavern"],
      ["184.5 miles total; the Brunswick stretch follows the Potomac and the rail line.", "C&O Canal Towpath"],
      ["Closest deck to Carroll Creek; ParkMobile after-hours, free first hour weekends.", "Church Street Garage"],
      ["Part coffee bar, part bike shop on East 6th: pour-overs up front, gravel and road bikes in back. A cyclists' clubhouse.", "Gravel & Grind"],
    ] as const) {
      expect(isJunkBlurb(blurb, name), blurb).toBe(false);
    }
  });

  it("keeps truncated but REAL prose (when unsure, keep)", () => {
    // Shipped scrape truncations that are still sentences a reader can use.
    for (const [blurb, name] of [
      ["She brings a lifetime of engagement in compassionately helping", "Alice McCormick Acupuncture"],
      ["The Flying Barrel Come by the shop for all your homebrewing and wine making needs", "The Flying Barrel"],
      ["Unwind Massage Therapy and Wellness Studio Offering deep tissue, Swedish, hot stone, cupping and couples massage in a relaxing setting", "Unwind Massage Therapy and Wellness Studio"],
      ["Mount Olivet Cemetery Explore its rich history, services, and serene grounds", "Mount Olivet Cemetery"],
    ] as const) {
      expect(isJunkBlurb(blurb, name), blurb).toBe(false);
    }
  });

  it("keeps prose that merely opens with an address or mentions one", () => {
    expect(
      isJunkBlurb(
        "Holistic Health Associates 603B W Patrick St, Frederick, MD, 2 Expertise in acupuncture, massage, supplementation, and more",
        "Holistic Health Associates",
      ),
    ).toBe(false);
    expect(
      isJunkBlurb("The shop at 123 Main St, Frederick, MD 21701 pours the county's best espresso.", "Some Cafe"),
    ).toBe(false);
  });

  it("keeps short real blurbs and sentences ending at the name", () => {
    expect(isJunkBlurb("Island vibes on Market Street.", "Caribbean Grill")).toBe(false);
    expect(isJunkBlurb("Be still", "24-7 Prayer Room - Frederick")).toBe(false);
  });
});

describe("stripRepeatedNamePrefix", () => {
  it("keeps the useful sentence after a repeated full place name", () => {
    expect(
      stripRepeatedNamePrefix(
        "The Flying Barrel Come by the shop for all your homebrewing and wine making needs",
        "The Flying Barrel",
      ),
    ).toBe("Come by the shop for all your homebrewing and wine making needs");
  });

  it("handles punctuation differences without stripping ordinary prose", () => {
    expect(stripRepeatedNamePrefix("Bill & Earl's Friendly neighborhood service.", "Bill and Earls"))
      .toBe("Friendly neighborhood service.");
    expect(stripRepeatedNamePrefix("Island vibes on Market Street.", "Caribbean Grill"))
      .toBe("Island vibes on Market Street.");
  });
});
