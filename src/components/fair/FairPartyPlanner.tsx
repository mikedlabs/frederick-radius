"use client";

import { ExternalLink, UsersRound } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import {
  MAX_FAIR_PARTY_GUESTS,
  recommendFairPartyPlan,
  type FairParty,
  type FairPartyOffer,
} from "@/lib/fair/party-plan";

type PartyField = keyof FairParty;
type PartyFieldUpdate = {
  party: FairParty;
  announcement: string;
};

const PARTY_FIELDS: Array<{
  key: PartyField;
  label: string;
  support: string;
}> = [
  {
    key: "adults11Plus",
    label: "Adults 11+",
    support: "Admission guests",
  },
  {
    key: "children10Under",
    label: "Children 10 and under",
    support: "Free admission guests",
  },
  {
    key: "adultRiders",
    label: "Adult riders",
    support: "Ride-all-day requested",
  },
  {
    key: "childRiders",
    label: "Child riders",
    support: "Ride-all-day requested",
  },
];

function moneyLabel(amountCents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: amountCents % 100 === 0 ? 0 : 2,
  }).format(amountCents / 100);
}

function boundedCount(value: string, maximum: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(maximum, Math.max(0, Math.trunc(parsed)));
}

function fieldCountLabel(field: PartyField): string {
  if (field === "adults11Plus") return "adult guest";
  if (field === "children10Under") return "child guest";
  if (field === "adultRiders") return "adult rider";
  return "child rider";
}

function boundedCountAnnouncement(
  field: PartyField,
  rawValue: string,
  boundedValue: number,
  maximum: number,
): string {
  if (rawValue.trim() === "") return "";
  const parsed = Number(rawValue);
  const countLabel = fieldCountLabel(field);
  if (!Number.isFinite(parsed)) {
    return `The ${countLabel} count was set to 0 because counts must be numbers.`;
  }
  if (parsed < 0) {
    return `The ${countLabel} count was set to 0 because counts cannot be negative.`;
  }
  if (parsed > maximum) {
    return field === "adultRiders" || field === "childRiders"
      ? `The ${countLabel} count was limited to ${maximum} because rider counts cannot exceed their matching age total.`
      : `The ${countLabel} count was limited to ${maximum} because one plan can include up to ${MAX_FAIR_PARTY_GUESTS} people.`;
  }
  if (!Number.isInteger(parsed)) {
    return `The ${countLabel} count was rounded down to ${boundedValue} because counts must be whole numbers.`;
  }
  return "";
}

function fieldMaximum(party: FairParty, field: PartyField): number {
  if (field === "adultRiders") return party.adults11Plus;
  if (field === "childRiders") return party.children10Under;
  if (field === "adults11Plus") {
    return MAX_FAIR_PARTY_GUESTS - party.children10Under;
  }
  return MAX_FAIR_PARTY_GUESTS - party.adults11Plus;
}

function updatePartyField(
  party: FairParty,
  field: PartyField,
  rawValue: string,
): PartyFieldUpdate {
  const maximum = fieldMaximum(party, field);
  const boundedValue = boundedCount(rawValue, maximum);
  const next = { ...party, [field]: boundedValue };
  const announcements = [
    boundedCountAnnouncement(field, rawValue, boundedValue, maximum),
  ].filter(Boolean);
  if (field === "adults11Plus") {
    const previousRiderCount = next.adultRiders;
    next.adultRiders = Math.min(next.adultRiders, next.adults11Plus);
    if (next.adultRiders < previousRiderCount) {
      announcements.push(
        `The adult rider count was reduced from ${previousRiderCount} to ${next.adultRiders} because rider counts cannot exceed their matching age total.`,
      );
    }
  }
  if (field === "children10Under") {
    const previousRiderCount = next.childRiders;
    next.childRiders = Math.min(next.childRiders, next.children10Under);
    if (next.childRiders < previousRiderCount) {
      announcements.push(
        `The child rider count was reduced from ${previousRiderCount} to ${next.childRiders} because rider counts cannot exceed their matching age total.`,
      );
    }
  }
  return {
    party: next,
    announcement: announcements.join(" "),
  };
}

export default function FairPartyPlanner({
  party,
  date,
  asOf,
  offers,
  onPartyChange,
}: {
  party: FairParty;
  date: string;
  asOf: string;
  offers: readonly FairPartyOffer[];
  onPartyChange: (party: FairParty) => void;
}) {
  const [adjustmentAnnouncement, setAdjustmentAnnouncement] = useState("");
  const result = recommendFairPartyPlan({ party, date, asOf, offers });
  const requestedRiders = party.adultRiders + party.childRiders;
  const totalGuests = party.adults11Plus + party.children10Under;
  const handoffs =
    result.status === "complete"
      ? Array.from(
          new Map(
            result.lines.map((item) => [
              item.officialPurchaseUrl ?? item.officialInfoUrl,
              {
                url: item.officialPurchaseUrl ?? item.officialInfoUrl,
                purchase: item.officialPurchaseUrl !== null,
                label: item.label,
              },
            ]),
          ).values(),
        )
      : [];

  return (
    <section aria-labelledby="fair-party-heading">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4
            id="fair-party-heading"
            className="text-[16px] font-semibold tracking-tight"
            style={{ color: "var(--app-ink)" }}
          >
            Plan tickets for your party.
          </h4>
          <p
            id="fair-party-support"
            className="mt-1 text-[12px] leading-relaxed"
            style={{ color: "var(--app-ink-3)" }}
          >
            Counts stay on this device. Riders are included in the age totals. One plan can include up to 40 people.
          </p>
        </div>
        <UsersRound
          className="mt-0.5 h-5 w-5 shrink-0"
          style={{ color: "var(--app-brand-press)" }}
          aria-hidden
        />
      </div>

      <fieldset
        className="mt-3 grid grid-cols-1 gap-x-3 gap-y-3 min-[360px]:grid-cols-2"
        aria-describedby="fair-party-support"
      >
        <legend className="sr-only">Fair party counts</legend>
        {PARTY_FIELDS.map((field) => {
          const maximum = fieldMaximum(party, field.key);
          return (
            <label
              key={field.key}
              className="grid min-w-0 grid-cols-[minmax(0,1fr)_4rem] items-center gap-2 border-b pb-2"
              style={{ borderColor: "var(--app-border)" }}
            >
              <span className="min-w-0">
                <span
                  className="block text-[12.5px] font-semibold leading-tight"
                  style={{ color: "var(--app-ink)" }}
                >
                  {field.label}
                </span>
                <span
                  className="mt-0.5 block text-[11px] leading-tight"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  {field.support}
                </span>
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={maximum}
                step={1}
                value={party[field.key]}
                onChange={(event) => {
                  const update = updatePartyField(
                    party,
                    field.key,
                    event.target.value,
                  );
                  setAdjustmentAnnouncement(update.announcement);
                  onPartyChange(update.party);
                }}
                aria-label={field.label}
                className="h-11 w-16 rounded-[var(--app-radius-sm)] border bg-[var(--app-bg)] px-2 text-center text-[16px] font-bold tabular-nums outline-none focus:border-[var(--app-brand)] focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--app-brand)_20%,transparent)]"
                style={{
                  borderColor: "var(--app-border-strong)",
                  color: "var(--app-ink)",
                }}
              />
            </label>
          );
        })}
      </fieldset>
      <p
        id="fair-party-adjustment-status"
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {adjustmentAnnouncement}
      </p>

      <div
        className="mt-4 border-l-2 px-3.5 py-3.5"
        style={{
          borderColor:
            result.status === "complete"
              ? "var(--app-brand-press)"
              : "var(--app-border-strong)",
          background: "var(--app-bg-sunken)",
        }}
      >
        {result.status === "complete" ? (
          <>
            <div
              className="flex items-start justify-between gap-4"
              aria-live="polite"
              aria-atomic="true"
            >
              <div>
                <p
                  className="text-[11px] font-bold uppercase tracking-[0.1em]"
                  style={{ color: "var(--app-brand-press)" }}
                >
                  {result.conditional
                    ? "Conditional lowest reviewed listed subtotal"
                    : "Lowest reviewed listed subtotal"}
                </p>
                <p className="mt-1 text-[13px] leading-relaxed">
                  This covers admission for all {totalGuests} guest
                  {totalGuests === 1 ? "" : "s"}
                  {requestedRiders > 0
                    ? ` and ride-all-day access for the ${requestedRiders} guest${requestedRiders === 1 ? "" : "s"} you entered.`
                    : ". No ride-all-day access was requested."}
                </p>
              </div>
              <strong
                className="shrink-0 text-[24px] leading-none tabular-nums"
                style={{ color: "var(--app-brand-press)" }}
              >
                {moneyLabel(result.listedSubtotalCents)}
              </strong>
            </div>

            {result.conditional ? (
              <p
                className="mt-2 text-[11.5px] font-semibold leading-relaxed"
                style={{ color: "var(--app-cool)" }}
              >
                This subtotal is conditional on the published Carload rules below.
              </p>
            ) : null}

            <ol
              className="mt-3 border-y"
              style={{ borderColor: "var(--app-border)" }}
              aria-label="Reviewed party ticket combination"
            >
              {result.lines.map((item) => (
                <li
                  key={item.offerId}
                  className="flex min-h-11 items-center justify-between gap-3 py-2 text-[12.5px]"
                >
                  <span className="font-semibold">
                    {item.quantity} × {item.label}
                  </span>
                  <span className="shrink-0 font-bold tabular-nums">
                    {moneyLabel(item.lineSubtotalCents)}
                  </span>
                </li>
              ))}
            </ol>

            {result.notes.map((note) => (
              <p
                key={note}
                className="mt-2 text-[11.5px] leading-relaxed"
                style={{ color: "var(--app-ink-2)" }}
              >
                {note}
              </p>
            ))}

            {handoffs.length > 0 ? (
              <div
                className="mt-3 grid gap-2"
                role="group"
                aria-label="Official ticket handoffs"
              >
                {handoffs.map((handoff) => (
                  <div
                    key={handoff.url}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2"
                  >
                    <span className="text-[11.5px] font-semibold leading-snug">
                      {handoff.label}
                    </span>
                    <Button
                      href={handoff.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      variant="secondary"
                      size="sm"
                      aria-label={
                        handoff.purchase
                          ? `Continue to Etix for ${handoff.label}`
                          : `Review ${handoff.label} officially`
                      }
                      iconRight={<ExternalLink className="h-4 w-4" aria-hidden />}
                    >
                      {handoff.purchase ? "Open Etix" : "Official details"}
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
            <p
              className="mt-3 text-[11px] leading-relaxed"
              style={{ color: "var(--app-ink-3)" }}
            >
              Radius uses only reviewed listed prices. Official checkout controls the final price and availability, and Radius does not sell or hold tickets.
            </p>
          </>
        ) : (
          <p
            className="text-[12.5px] leading-relaxed"
            style={{ color: "var(--app-ink-2)" }}
            role="status"
          >
            {result.message}
          </p>
        )}
      </div>
    </section>
  );
}
