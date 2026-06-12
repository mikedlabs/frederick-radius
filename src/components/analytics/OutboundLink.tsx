"use client";

import type { AnchorHTMLAttributes, ReactNode } from "react";
import { track } from "@/lib/posthog";

/**
 * OutboundLink — the shared external anchor (Session 0 measurement).
 * Renders the exact <a target="_blank" rel="noopener noreferrer">
 * markup the bespoke anchors used (className/style pass straight
 * through, so swapping it in changes no UI), plus one capture on tap:
 * outbound_clicked by default, or directions_tapped when
 * kind="directions".
 *
 * Server components can render this directly; only this leaf is a
 * client island.
 */
export default function OutboundLink({
  href,
  surface,
  kind = "outbound",
  slug,
  provider,
  children,
  ...rest
}: {
  href: string;
  /** Where this link lives, e.g. "partner_apps", "event_detail". */
  surface: string;
  /** "directions" routes the capture to directions_tapped. */
  kind?: "outbound" | "directions";
  /** Place or event slug when one is in scope. */
  slug?: string;
  /** Directions provider ("google" | "apple") when kind="directions". */
  provider?: string;
  children: ReactNode;
} & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => {
        if (kind === "directions") {
          track.directionsTapped({ slug, provider: provider ?? "unknown" });
        } else {
          track.outboundClicked({ href, surface });
        }
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
