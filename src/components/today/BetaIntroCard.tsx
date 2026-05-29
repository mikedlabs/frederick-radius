"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ArrowRight, MessageSquare, Compass, X } from "lucide-react";
import BottomDrawer from "@/components/ui/BottomDrawer";

/**
 * BetaIntroCard — first-visit welcome.
 *
 * v4 (May 2026): redesigned as a field-guide COVER. A sweeping
 * Frederick photo header carries a masthead (compass + wordmark + beta
 * pill) and the serif "Welcome to Frederick." title; the founder's
 * note sits on cream below. Far more eye-catching than the prior
 * icon-and-five-paragraphs sheet, and consistent with the app's
 * photo-led card language.
 *
 * Still a first-visit POPUP via BottomDrawer (controlled, opens once
 * when the dismiss key is unset, never again after dismiss). Uses
 * BottomDrawer's `bareHeader` mode so the photo reads as the cover —
 * the drawer's own title is kept for screen readers only.
 *
 * Copy is plain and unchanged: say what this is, why it exists, that
 * it's early, and how to push back.
 *
 * Version-keyed (`v8`) so this redesign re-shows the popup to everyone.
 */

const KEY = "fr:beta-intro-dismissed:v8";
const FEEDBACK_EMAIL = "miked@madproductions.io";
const FEEDBACK_SUBJECT = "Frederick Radius feedback";
// Iconic, instantly-recognizable Frederick: the clustered spires.
// Curate / rotate seasonally later; one striking cover for now.
const COVER_IMG = "/history-photos/clustered-spires.webp";

export default function BetaIntroCard() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const dismissed = window.localStorage.getItem(KEY) === "true";
      if (!dismissed) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate dismiss state after mount; localStorage isn't readable during SSR
        setOpen(true);
      }
    } catch {
      // localStorage unavailable — open as a one-time fallback so
      // the user at least sees the intro once.
      setOpen(true);
    }
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const dismiss = () => {
    setOpen(false);
    try {
      window.localStorage.setItem(KEY, "true");
    } catch {
      /* ignore */
    }
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      // Treat any close (X / drag-down / backdrop tap) as a dismiss.
      try {
        window.localStorage.setItem(KEY, "true");
      } catch {
        /* ignore */
      }
    }
  };

  const mailto =
    `mailto:${FEEDBACK_EMAIL}` +
    `?subject=${encodeURIComponent(FEEDBACK_SUBJECT)}` +
    `&body=${encodeURIComponent(
      "What I love:\n\nWhat felt confusing or broken:\n\nWhat I wish existed:\n\n\n— sent from " +
        (typeof window !== "undefined" ? window.location.href : "frederickradius.app"),
    )}`;

  return (
    <BottomDrawer
      open={open}
      onOpenChange={handleOpenChange}
      title="Welcome to Frederick Radius"
      subtitle="Beta · May 2026"
      bareHeader
    >
      <div className="px-3 pb-2 pt-1">
        <div
          className="relative overflow-hidden rounded-[22px] border"
          style={{
            borderColor: "var(--app-border)",
            boxShadow: "var(--app-elev-2), var(--app-edge), var(--app-hi)",
          }}
        >
          {/* ── COVER — sweeping Frederick photo + masthead + title ── */}
          <div className="relative aspect-[1.5/1] w-full overflow-hidden">
            <Image
              src={COVER_IMG}
              alt="The clustered spires of Downtown Frederick"
              fill
              sizes="(max-width: 480px) 100vw, 460px"
              className="object-cover"
              priority
            />
            {/* legibility scrim */}
            <span
              aria-hidden
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(to top, rgba(12,10,8,0.90) 0%, rgba(12,10,8,0.10) 50%, rgba(12,10,8,0.44) 100%)",
              }}
            />
            {/* masthead */}
            <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4 text-white">
              <span
                className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.22em]"
                style={{ textShadow: "0 1px 4px rgba(0,0,0,0.6)" }}
              >
                <Compass className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden /> Frederick Radius
              </span>
              <span
                className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em]"
                style={{
                  background: "rgba(255,255,255,0.18)",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                }}
              >
                Beta · May 2026
              </span>
            </div>
            {/* cover title */}
            <div className="absolute inset-x-0 bottom-0 p-5 text-white">
              <p
                className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-85"
                style={{ textShadow: "0 1px 4px rgba(0,0,0,0.6)" }}
              >
                A field guide to the county
              </p>
              <p
                className="mt-1 font-serif text-[30px] font-semibold leading-[1.0] tracking-tight"
                style={{ textShadow: "0 2px 16px rgba(0,0,0,0.5)" }}
              >
                Welcome to Frederick.
              </p>
            </div>
            {/* close */}
            <button
              type="button"
              onClick={dismiss}
              aria-label="Close welcome"
              className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full text-white transition active:scale-[0.94]"
              style={{
                background: "rgba(0,0,0,0.38)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
              }}
            >
              <X className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            </button>
          </div>

          {/* ── BODY on cream — the founder's note (full copy) ── */}
          <div className="space-y-3 px-5 py-5" style={{ background: "var(--app-bg-elevated)" }}>
            <p
              className="font-serif text-[19px] font-semibold leading-snug tracking-tight"
              style={{ color: "var(--app-ink)" }}
            >
              I have lived in Downtown Frederick for nearly 10 years, and I
              still find out about things after they happen.
            </p>
            <div className="space-y-3 text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
              <p>That is part of why I built Frederick Radius.</p>
              <p>
                Frederick County and the city are connected in real life, but
                the information around them is scattered across too many
                places. Events get buried. Business updates disappear. Local
                services are not always easy to find. Visitors ask the same
                questions. Residents do too.
              </p>
              <p>
                Frederick Radius is an early web app built to bring more of
                those pieces together for the county and the city.
              </p>
              <p>There is nothing to download. It works right in your browser.</p>
              <p>
                This is still beta, and it will keep changing. I would love to
                know what you think.
              </p>
            </div>
            <a
              href={mailto}
              className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold transition active:scale-[0.98]"
              style={{
                background: "var(--app-brand)",
                color: "white",
                boxShadow: "var(--app-brand-glow)",
              }}
            >
              <MessageSquare className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
              Send feedback
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
            </a>
            <p className="pt-1 text-[12px] italic" style={{ color: "var(--app-ink-3)" }}>
              Made by Michael DeMattia, a downtown Frederick resident.
            </p>
          </div>
        </div>
      </div>
    </BottomDrawer>
  );
}
