"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";

function searchHref(query: string, returnTo?: string): string {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (returnTo) params.set("returnTo", returnTo);
  const suffix = params.toString();
  return suffix ? `/search?${suffix}` : "/search";
}

export default function SearchInput({
  defaultValue = "",
  returnTo,
}: {
  defaultValue?: string;
  returnTo?: string;
}) {
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
        router.push(searchHref(next, returnTo));
      }}
      className="search-field-shell flex items-center gap-2 rounded-full border bg-[var(--app-bg-elevated)] px-3"
      style={{ borderColor: "var(--app-control-border)" }}
    >
      <label htmlFor="site-search-input" className="sr-only">
        Search Frederick County
      </label>
      <Search className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden style={{ color: "var(--app-ink-3)" }} />
      <input
        id="site-search-input"
        ref={inputRef}
        type="search"
        name="q"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Find places, events, towns, tools"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        className="w-full bg-transparent py-3 text-[16px] outline-none placeholder:text-[color:var(--app-ink-3)]"
        style={{ color: "var(--app-ink)" }}
      />
      {q && (
        <button
          type="button"
          onClick={() => {
            setQ("");
            router.push(searchHref("", returnTo));
          }}
          className="tap-44 rounded px-1 text-xs"
          style={{ color: "var(--app-ink-3)" }}
        >
          Clear
        </button>
      )}
    </form>
  );
}
