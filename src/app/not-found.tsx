import Link from "next/link";
import type { Metadata } from "next";
import RippleMark from "@/components/brand/RippleMark";
import NotFoundFindButton from "@/components/nav/NotFoundFindButton";

export const metadata: Metadata = {
  title: "Page not found",
  description:
    "That Frederick Radius page could not be found. Search the guide or return to Today.",
  robots: { index: false, follow: true },
};

/**
 * Global 404 on the normal Cream canvas: the mark, one plain sentence, one
 * primary action and one text link.
 *
 * Next renders this inside the (app) layout for app routes, where AppMain
 * already provides the page's single <main id="main-content">. The 404 is
 * therefore a plain block, never a second main landmark. Search opens the
 * header's one Find overlay rather than mounting another field that would
 * take focus and raise a keyboard on arrival.
 */
export default function NotFound() {
  return (
    <div
      data-not-found
      className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center gap-5 px-2 py-12 text-center"
      style={{ color: "var(--app-ink)" }}
    >
      <span style={{ color: "var(--app-brand)" }}>
        <RippleMark size={48} />
      </span>
      <div className="space-y-2">
        <h1 className="display-1" style={{ color: "var(--app-ink)" }}>
          That page isn&apos;t here.
        </h1>
        <p
          className="mx-auto max-w-sm text-[15px] text-pretty"
          style={{ color: "var(--app-ink-2)" }}
        >
          The link may be old, or the page may have been removed.
        </p>
      </div>
      <NotFoundFindButton />
      <Link
        href="/today"
        className="inline-flex min-h-11 items-center px-2 text-[15px] font-semibold underline underline-offset-4"
        style={{ color: "var(--app-brand-press)" }}
      >
        Go to Today
      </Link>
    </div>
  );
}
