"use client";

import { CheckCircle2, ChevronDown, ExternalLink, Search, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";

import type { FairPracticalAnswer } from "@/lib/fair/practical-answers";

type AnswerStage =
  | "all"
  | FairPracticalAnswer["usefulBefore"][number];

const STAGES: Array<{ id: AnswerStage; label: string }> = [
  { id: "all", label: "All" },
  { id: "leave-home", label: "Before leaving" },
  { id: "park", label: "Parking" },
  { id: "enter", label: "At the gate" },
  { id: "inside", label: "Inside" },
  { id: "leave", label: "Leaving" },
];

function evidenceCopy(answer: FairPracticalAnswer): string {
  if (answer.evidence === "verified-official") {
    return "Verified from official Fair sources";
  }
  if (answer.evidence === "not-confirmed") {
    return "Not confirmed in the current official pages";
  }
  return "Community lead awaiting official confirmation";
}

function checkedDate(answer: FairPracticalAnswer): string {
  const latest = answer.sources
    .map((source) => Date.parse(source.checkedAt))
    .filter(Number.isFinite)
    .sort((left, right) => right - left)[0];
  if (latest === undefined) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  }).format(new Date(latest));
}

export default function FairPracticalAnswers({
  answers,
}: {
  answers: FairPracticalAnswer[];
}) {
  const [stage, setStage] = useState<AnswerStage>("all");
  const [query, setQuery] = useState("");
  const publicAnswers = useMemo(
    () => answers.filter((answer) => answer.evidence !== "community-pattern"),
    [answers],
  );
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matches = publicAnswers.filter((answer) => {
    if (stage !== "all" && !answer.usefulBefore.includes(stage)) return false;
    if (!normalizedQuery) return true;
    return `${answer.question} ${answer.answer} ${answer.category}`
      .toLocaleLowerCase()
      .includes(normalizedQuery);
  });
  const answerNoun = matches.length === 1 ? "practical answer" : "practical answers";
  const activeStageLabel = STAGES.find((option) => option.id === stage)?.label ?? "All";
  const resultStatus =
    matches.length === 0
      ? normalizedQuery
        ? `No practical answers match "${query.trim()}".`
        : stage === "all"
          ? "No practical answers are available."
          : `No practical answers match the ${activeStageLabel} filter.`
      : normalizedQuery
        ? `${matches.length} ${answerNoun} match "${query.trim()}".`
        : stage === "all"
          ? `${matches.length} ${answerNoun} shown.`
          : `${matches.length} ${answerNoun} shown for the ${activeStageLabel} filter.`;

  return (
    <section
      id="answers"
      aria-labelledby="fair-practical-heading"
      className="scroll-mt-24 border-t pt-8"
      style={{ borderColor: "var(--app-border-strong)" }}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p
            className="text-[11px] font-bold uppercase tracking-[0.14em]"
            style={{ color: "var(--app-brand-press)" }}
          >
            Practical answers
          </p>
          <h2 id="fair-practical-heading" tabIndex={-1} className="mt-1 text-[25px] font-bold leading-tight tracking-[-0.035em] outline-none">
            Things people miss
          </h2>
          <p
            className="mt-2 max-w-[34rem] text-[12.5px] leading-relaxed"
            style={{ color: "var(--app-ink-2)" }}
          >
            Find the details that can change parking, entry, tickets, family care, and the trip home.
          </p>
        </div>
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
          style={{
            background: "color-mix(in srgb, var(--app-brand) 10%, var(--app-bg-elevated))",
            color: "var(--app-brand-press)",
          }}
          aria-hidden
        >
          ?
        </span>
      </div>

      <div
        role="group"
        className="scrollbar-none -mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6"
        aria-label="Filter practical answers by part of the visit"
      >
        {STAGES.map((option) => {
          const active = stage === option.id;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              onClick={() => setStage(option.id)}
              className="min-h-11 shrink-0 rounded-full border px-3 text-[12px] font-semibold transition-colors motion-reduce:transition-none"
              style={{
                borderColor: active ? "var(--app-brand-press)" : "var(--app-border)",
                background: active
                  ? "var(--app-brand-press)"
                  : "var(--app-bg-elevated)",
                color: active ? "var(--app-on-brand)" : "var(--app-ink-2)",
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <label className="mt-3 block" htmlFor="fair-practical-search">
        <span className="sr-only">Search practical Fair answers</span>
        <span className="relative block">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
            style={{ color: "var(--app-ink-3)" }}
            aria-hidden
          />
          <input
            id="fair-practical-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search parking, bags, children, rides, or re-entry"
            className="h-12 w-full rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] pl-10 pr-3 text-[13px] outline-none placeholder:text-[var(--app-ink-3)] focus:border-[var(--app-brand)] focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--app-brand)_20%,transparent)]"
            style={{ borderColor: "var(--app-border-strong)", color: "var(--app-ink)" }}
          />
        </span>
      </label>

      <p
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {resultStatus}
      </p>

      {matches.length > 0 ? (
        <div className="mt-4 border-y" style={{ borderColor: "var(--app-border)" }}>
          {matches.map((answer) => {
            const unconfirmed = answer.evidence === "not-confirmed";
            const EvidenceIcon = unconfirmed ? ShieldAlert : CheckCircle2;
            return (
              <details
                key={answer.id}
                className="group border-b last:border-b-0"
                style={{ borderColor: "var(--app-border)" }}
                open={openIds.has(answer.id)}
                onToggle={(event) => {
                  const isOpen = event.currentTarget.open;
                  setOpenIds((current) => {
                    if (current.has(answer.id) === isOpen) return current;
                    const next = new Set(current);
                    if (isOpen) next.add(answer.id);
                    else next.delete(answer.id);
                    return next;
                  });
                }}
              >
                <summary className="flex min-h-[64px] cursor-pointer list-none items-center justify-between gap-3 py-3 outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--app-bg)]">
                  <span className="min-w-0">
                    <span className="block text-[14px] font-semibold leading-snug" style={{ color: "var(--app-ink)" }}>
                      {answer.question}
                    </span>
                    <span
                      className="mt-1 flex items-center gap-1.5 text-[10.5px] font-semibold leading-snug"
                      style={{ color: unconfirmed ? "var(--app-warning-press)" : "var(--app-ink-3)" }}
                    >
                      <EvidenceIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      {evidenceCopy(answer)}
                    </span>
                  </span>
                  <ChevronDown
                    className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
                    style={{ color: "var(--app-ink-3)" }}
                    aria-hidden
                  />
                </summary>
                <div
                  className="border-l-2 pb-4 pl-4 pr-2"
                  style={{ borderColor: unconfirmed ? "var(--app-warning-press)" : "var(--app-brand-2)" }}
                >
                  <p className="text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
                    {answer.answer}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] leading-relaxed">
                    <span className="font-semibold" style={{ color: "var(--app-ink-3)" }}>
                      Sources:
                    </span>
                    {answer.sources.map((source) => (
                      <a
                        key={`${answer.id}-${source.url}`}
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-11 items-center font-semibold underline decoration-[color:var(--app-border-strong)] underline-offset-4"
                        style={{ color: "var(--app-cool)" }}
                      >
                        {source.label}
                      </a>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                    <span className="text-[10.5px] font-medium" style={{ color: "var(--app-ink-3)" }}>
                      Sources checked {checkedDate(answer)}.
                    </span>
                    {answer.action ? (
                      <a
                        href={answer.action.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="tap-44 inline-flex min-h-11 items-center gap-1.5 text-[11.5px] font-semibold"
                        style={{ color: "var(--app-brand-press)" }}
                      >
                        {answer.action.label}
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                      </a>
                    ) : null}
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      ) : (
        <div className="mt-4 border-y py-5" style={{ borderColor: "var(--app-border)" }}>
          <p className="text-sm font-semibold">No practical answer matches that search.</p>
          <p className="mt-1 text-[12px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
            Try a shorter word or choose another part of the visit.
          </p>
        </div>
      )}
    </section>
  );
}
