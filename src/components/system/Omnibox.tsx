"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import {
  parseIntent,
  TOKEN_LABEL,
  type IntentToken,
} from "@/lib/search/parseIntent";
import FilterChip from "./FilterChip";

/**
 * Omnibox — THE single search input (redesign brief: "exactly one search
 * input exists in the entire application"). Honest + deterministic: typing
 * a known intent phrase ("coffee open now") and submitting pulls the
 * recognized phrase into a removable filter chip and leaves the residual
 * ("coffee") as the search term. No model, no "Ask … anything" claim.
 *
 * Self-contained state so it works in the /system showcase; `onSubmit`
 * lets the shell (Phase 2) push tokens + text into the URL.
 */
export default function Omnibox({
  initialText = "",
  initialChips = [],
  onSubmit,
  autoFocus = false,
}: {
  initialText?: string;
  initialChips?: IntentToken[];
  onSubmit?: (q: { tokens: IntentToken[]; text: string }) => void;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState(initialText);
  const [chips, setChips] = useState<IntentToken[]>(initialChips);

  function commit(raw: string) {
    const { tokens, text: residual } = parseIntent(raw);
    const next = [...new Set([...chips, ...tokens])];
    setChips(next);
    setText(residual);
    onSubmit?.({ tokens: next, text: residual });
  }

  function removeChip(t: IntentToken) {
    const next = chips.filter((c) => c !== t);
    setChips(next);
    onSubmit?.({ tokens: next, text });
  }

  return (
    <div className="w-full">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          commit(text);
        }}
        className="flex items-center gap-2.5 rounded-full px-4 py-2.5"
        style={{
          background: "var(--app-bg-elevated-solid)",
          boxShadow: "var(--app-edge), var(--app-hi), var(--app-elev-2)",
        }}
      >
        <Search
          className="h-[18px] w-[18px] shrink-0"
          strokeWidth={2.25}
          aria-hidden
          style={{ color: "var(--app-ink-3)" }}
        />
        <input
          type="search"
          value={text}
          autoFocus={autoFocus}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search places, events, towns"
          aria-label="Search places, events, towns"
          enterKeyHint="search"
          className="t-body min-w-0 flex-1 bg-transparent outline-none placeholder:text-[var(--app-ink-3)]"
          style={{ color: "var(--app-ink)" }}
        />
      </form>

      {chips.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {chips.map((t) => (
            <FilterChip
              key={t}
              label={TOKEN_LABEL[t]}
              onRemove={() => removeChip(t)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
