"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";

export default function SearchInput({ defaultValue = "" }: { defaultValue?: string }) {
  const router = useRouter();
  const [q, setQ] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!defaultValue) inputRef.current?.focus();
  }, [defaultValue]);

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const next = q.trim();
        router.push(next ? `/search?q=${encodeURIComponent(next)}` : "/search");
      }}
      className="flex items-center gap-2 rounded-full border bg-[var(--app-bg-elevated)] px-3"
      style={{ borderColor: "var(--app-border)" }}
    >
      <Search className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden style={{ color: "var(--app-ink-3)" }} />
      <input
        ref={inputRef}
        type="search"
        name="q"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search places, events, towns…"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        className="w-full bg-transparent py-3 text-[15px] outline-none placeholder:text-[color:var(--app-ink-3)]"
        style={{ color: "var(--app-ink)" }}
      />
      {q && (
        <button
          type="button"
          onClick={() => {
            setQ("");
            router.push("/search");
          }}
          className="rounded px-1 text-xs"
          style={{ color: "var(--app-ink-3)" }}
        >
          Clear
        </button>
      )}
    </form>
  );
}
