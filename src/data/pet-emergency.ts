/**
 * Pet emergency & urgent care — hand-verified, never scraped.
 *
 * Beta-tester safety request (July 2026): "hospital" in a veterinary
 * practice's name says nothing about whether it runs an emergency room,
 * and a panicked owner wastes crisis minutes calling closed clinics.
 * This file is the county's verified answer, in tiers a stressed person
 * can act on:
 *
 *   er24    — a true around-the-clock emergency room. Go (or call en route).
 *   erHours — a real ER with LIMITED hours; the row carries them and any
 *             call-first policy verbatim from the facility.
 *   urgent  — urgent care: sick-but-stable cases, evening/weekend hours,
 *             NOT for life-threatening emergencies.
 *
 * Every row was verified against the facility's OWN site (plus, for the
 * ERs, cross-confirmed by two independent local clinics' referral lists)
 * on the `verified` date. Re-verify before editing; when a claim can't be
 * confirmed, the honest move is to drop the row, not to guess. Regular
 * clinics are deliberately NOT listed here - the page explains the tier
 * difference instead, which is the actual safety information.
 */

export type PetCareTier = "er24" | "erHours" | "urgent";

export type PetCareFacility = {
  name: string;
  tier: PetCareTier;
  phone: string;
  address: string;
  town: string;
  /** Hours in the facility's own wording. */
  hours: string;
  /** Call-first / arrival policy, verbatim-faithful. */
  policy?: string;
  url: string;
  /** Which part of the area this serves best, for the card's quiet hint. */
  areaNote?: string;
  /** YYYY-MM-DD the facts on this row were last confirmed at the source. */
  verified: string;
};

export const PET_CARE_FACILITIES: PetCareFacility[] = [
  {
    name: "Partner Veterinary Emergency & Specialty Center",
    tier: "er24",
    phone: "(301) 200-8185",
    address: "7330 Guilford Dr",
    town: "Frederick",
    hours: "Open 24 hours a day, every day",
    url: "https://partnervesc.com/emergency-frederick/",
    verified: "2026-07-10",
  },
  {
    name: "CARE Veterinary Center",
    tier: "er24",
    phone: "(301) 662-2273",
    address: "1080 W Patrick St",
    town: "Frederick",
    hours: "Emergency care open 24/7",
    url: "https://www.thrivepetcare.com/locations/maryland/frederick/care-veterinary-center",
    verified: "2026-07-10",
  },
  {
    name: "Mountain View Animal Emergency",
    tier: "erHours",
    phone: "(301) 733-7339",
    address: "13810 Crayton Blvd",
    town: "Hagerstown",
    hours: "Open daily, 10 AM to midnight",
    policy: "Call before you drive; walk-ins are not accommodated.",
    areaNote: "Often the closer ER from Thurmont and Emmitsburg",
    url: "https://mountainviewemergency.com/",
    verified: "2026-07-10",
  },
  {
    name: "BluePearl Urgent Care (formerly VetUrgency)",
    tier: "urgent",
    phone: "(301) 288-8387",
    address: "434 Prospect Blvd",
    town: "Frederick",
    hours: "Mon-Tue 6 PM-midnight · Wed closed · Thu-Fri 6 PM-midnight · Sat-Sun noon-midnight",
    policy: "Arrival times can be reserved online.",
    url: "https://bluepearlvet.com/hospital/frederick-md/",
    verified: "2026-07-10",
  },
];

/** 24/7 poison hotlines - national, staffed by veterinary toxicologists.
 *  Both charge a consultation fee; in a poisoning that call is still the
 *  right first move, and the case number they issue speeds up the ER. */
export const PET_POISON_LINES = [
  { name: "ASPCA Animal Poison Control", phone: "(888) 426-4435" },
  { name: "Pet Poison Helpline", phone: "(855) 764-7661" },
] as const;
