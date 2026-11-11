import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@/components/ui/Button";
import { Compass } from "lucide-react";
import SearchInput from "@/components/search/SearchInput";

export const NOT_FOUND_METADATA: Metadata = {
  title: "Page not found",
  description:
    "That Frederick Radius page could not be found. Search the guide or return to Today.",
  robots: { index: false, follow: true },
};

/** A few popular doorways back into the app, for a lost visitor. */
const DOORWAYS: Array<{ label: string; href: string }> = [
  { label: "Map", href: "/map" },
  { label: "Eat & drink", href: "/category/food" },
  { label: "Coffee", href: "/category/coffee" },
  { label: "Saved", href: "/my-radius" },
];

/**
 * Shared 404 presentation. The route boundary owns its main landmark:
 * standalone at the root, or the existing AppMain within the app shell.
 */
export default function NotFoundContent() {
  return (
    <div
      // Plain tool: the page ground is the plain surface token. No wash.
      className="relative min-h-screen overflow-hidden"
      style={{ background: "var(--app-bg)", color: "var(--app-ink)" }}
    >
      <div className="relative mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6 py-16 text-center">
        <Compass className="h-8 w-8" strokeWidth={1.5} aria-hidden style={{ color: "var(--app-cool-text)" }} />
        <div className="space-y-2">
          <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
            Page not found
          </p>
          <h1 className="display-1" style={{ color: "var(--app-ink)" }}>
            That page isn&apos;t here.
          </h1>
          <p
            className="mx-auto max-w-sm text-[14px] text-pretty"
            style={{ color: "var(--app-ink-2)" }}
          >
            The link may be old, or the page may have been removed. Search
            Frederick Radius or return to Today.
          </p>
        </div>
        {/* Search is the fastest way forward for someone who landed on a
            dead link — one field, straight into the ranked results. */}
        <div className="w-full max-w-sm">
          <SearchInput />
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button href="/today" size="md">
            Back home
          </Button>
          <Button href="/events" variant="secondary" size="md">
            See events
          </Button>
        </div>

        {/* Contextual doorways — a few popular ways back in. */}
        <nav aria-label="Popular pages" className="flex flex-wrap items-center justify-center gap-2">
          {DOORWAYS.map((d) => (
            <Link
              key={d.href}
              href={d.href}
              className="inline-flex min-h-11 items-center px-2 text-[14px] font-semibold underline underline-offset-[3px]"
              style={{ color: "var(--app-link)" }}
            >
              {d.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
