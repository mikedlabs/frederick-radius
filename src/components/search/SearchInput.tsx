"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { rememberNativeRequest } from "./native-request-return";
import { useNativeRequestReturn } from "./useNativeRequestReturn";

function searchHref(query: string, returnTo?: string, scope?: string, kind?: string): string {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (returnTo) params.set("returnTo", returnTo);
  if (scope) params.set("in", scope);
  if (kind) params.set("kind", kind);
  const suffix = params.toString();
  return suffix ? `/search?${suffix}` : "/search";
}

export default function SearchInput({
  defaultValue = "",
  returnTo,
  scope,
  kind,
}: {
  defaultValue?: string;
  returnTo?: string;
  scope?: string;
  kind?: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useNativeRequestReturn({ target: "search-input", inputKind: "search", inputRef, renderedQuery: defaultValue, onDraft: setQ });

  useEffect(() => {
    if (!defaultValue) inputRef.current?.focus();
  }, [defaultValue]);

  return (
    <form
      action="/search"
      method="get"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        // The field may have received input before React finished hydrating.
        // Submit the same visible value the native GET form would send.
        const visibleQuery = inputRef.current?.value ?? q;
        rememberNativeRequest({ draft: { kind: "search", query: visibleQuery }, target: "search-input" });
        router.push(searchHref(visibleQuery.trim(), returnTo, scope, kind));
      }}
      className="flex flex-wrap items-stretch gap-2"
    >
      <div className="search-field-shell flex min-w-0 flex-[1_1_13rem] items-center gap-2 rounded-full border border-[var(--app-control-border)] bg-[var(--app-bg-elevated)] px-3">
        <label htmlFor="site-search-input" className="sr-only">
          Search Frederick County
        </label>
        <Search className="h-4 w-4 shrink-0 text-[var(--app-ink-3)]" strokeWidth={1.75} aria-hidden />
        <input
          id="site-search-input"
          ref={inputRef}
          type="search"
          name="q"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            rememberNativeRequest({ draft: { kind: "search", query: e.target.value } });
          }}
          placeholder="Places, events, towns, tools"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent py-3 text-base text-[var(--app-ink)] outline-none placeholder:text-[color:var(--app-ink-3)] [&::-webkit-search-cancel-button]:hidden"
        />
        {q && (
          <button
            type="button"
            aria-label="Clear"
            onClick={() => {
              setQ("");
              inputRef.current?.focus();
              rememberNativeRequest({ draft: { kind: "search", query: "" }, target: "search-input" });
              router.push(searchHref("", returnTo, scope, kind));
            }}
            className="-mr-2 grid size-11 shrink-0 place-items-center rounded-full text-[var(--app-ink-2)] hover:bg-[var(--app-bg-sunken)]"
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>
      {/* Native GET replaces the query string, so context must be successful
          form controls before hydration as well as in the client handler. */}
      {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
      {scope && <input type="hidden" name="in" value={scope} />}
      {kind && <input type="hidden" name="kind" value={kind} />}
      <button
        type="submit"
        className="tactile-interactive min-h-11 max-w-full flex-[1_0_auto] rounded-full bg-[var(--app-brand-press)] px-4 py-2 text-base font-semibold text-[var(--app-on-brand)] sm:grow-0"
      >
        Search
      </button>
    </form>
  );
}
