"use client";

import { useState } from "react";
import Link from "next/link";

export type GuideCandidate = {
  slug: string;
  name: string;
  category: string;
  group: "eat" | "drink" | "outdoors" | "culture";
  open: boolean;
  photo?: string;
  reason: string;
};

type Mood = { key: GuideCandidate["group"]; label: string; sub: string };

const MOODS: Mood[] = [
  { key: "eat", label: "A good meal", sub: "Sit down and eat well" },
  { key: "drink", label: "A drink", sub: "A bar, a brewery, a porch" },
  { key: "outdoors", label: "Time outside", sub: "A trail, a park, the creek" },
  { key: "culture", label: "Something to see", sub: "A gallery, a stage, history" },
];

/**
 * Direction A guided mode. A conversation, not a form: one question with
 * generous space, then an editorial answer. The answer is three picks with
 * a point of view, each with one reason, not a results grid. The full list
 * is a deliberate second step, never the first thing shown.
 */
export default function GuideA({ candidates }: { candidates: GuideCandidate[] }) {
  const [mood, setMood] = useState<Mood | null>(null);

  if (!mood) {
    return (
      <div className="px-[var(--a-gutter)] pt-10">
        <p className="lab-a-mono uppercase tracking-[0.2em]" style={{ fontSize: "var(--a-size-label)", color: "var(--a-ink-3)" }}>
          One question
        </p>
        <h1 className="lab-a-display pt-3" style={{ fontSize: "var(--a-size-title)" }}>
          What sounds good right now?
        </h1>
        <div className="pt-8">
          {MOODS.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMood(m)}
              className="block w-full text-left"
            >
              <div className="lab-a-rule" />
              <div className="flex items-baseline justify-between py-5">
                <span className="lab-a-display" style={{ fontSize: "var(--a-size-lead)" }}>
                  {m.label}
                </span>
                <span className="lab-a-mono uppercase tracking-[0.12em]" style={{ fontSize: "var(--a-size-data)", color: "var(--a-ink-3)" }}>
                  {m.sub}
                </span>
              </div>
            </button>
          ))}
          <div className="lab-a-rule" />
        </div>
      </div>
    );
  }

  const pool = candidates.filter((c) => c.group === mood.key);
  const open = pool.filter((c) => c.open);
  const picks = (open.length >= 3 ? open : pool).slice(0, 3);

  return (
    <div className="px-[var(--a-gutter)] pt-10">
      <button
        type="button"
        onClick={() => setMood(null)}
        className="lab-a-mono uppercase tracking-[0.16em]"
        style={{ fontSize: "var(--a-size-data)", color: "var(--a-ink-3)" }}
      >
        ← Ask again
      </button>
      <h1 className="lab-a-display pt-3" style={{ fontSize: "var(--a-size-title)" }}>
        Here is where I would go.
      </h1>
      <p className="pt-3" style={{ fontSize: "var(--a-size-body)", color: "var(--a-ink-2)", lineHeight: 1.5 }}>
        Three picks for {mood.label.toLowerCase()}, open now and worth the trip. Start at the top.
      </p>

      <div className="pt-8">
        {picks.map((c, i) => (
          <Link key={c.slug} href={`/labs/a/place/${c.slug}`} className="block">
            <div className="lab-a-band" />
            <div className="flex gap-4 py-5">
              <span className="lab-a-display" style={{ fontSize: "var(--a-size-title)", color: "var(--a-ink-3)", lineHeight: 1 }}>
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="lab-a-display" style={{ fontSize: "var(--a-size-lead)" }}>
                  {c.name}
                </h2>
                <p className="pt-1.5" style={{ fontSize: "var(--a-size-body)", color: "var(--a-ink-2)", lineHeight: 1.45 }}>
                  {c.reason}
                </p>
              </div>
            </div>
          </Link>
        ))}
        <div className="lab-a-band" />
      </div>

      {picks[0] && (
        <Link
          href={`/labs/a/place/${picks[0].slug}`}
          className="lab-a-primary mt-8 flex h-12 w-full items-center justify-center"
          style={{ fontSize: "var(--a-size-body)" }}
        >
          Take me to {picks[0].name}
        </Link>
      )}
      <Link
        href="/labs/a/map"
        className="mt-3 flex h-12 w-full items-center justify-center"
        style={{ fontSize: "var(--a-size-label)", color: "var(--a-ink-3)" }}
      >
        Or see them all on the map
      </Link>
    </div>
  );
}
