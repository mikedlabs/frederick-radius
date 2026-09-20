"use client";

import { Check, Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { FAIR_DAY_PATH } from "@/lib/fair/plan-status";
import { fairVendorShareUrl } from "./FairVendorExplorer";

export type FairPicksShare = {
  dateLabel: string;
  scheduleItems: readonly { title: string; timeLabel: string }[];
  vendors: readonly { id: string; name: string }[];
};

/** Deliberately accepts public picks, not the private plan/party/location model. */
export function fairPicksShareText(origin: string, picks: FairPicksShare): string {
  return [
    `My Fair picks for ${picks.dateLabel}`,
    ...(picks.scheduleItems.length ? ["", "Scheduled events", ...picks.scheduleItems.map((item) => `${item.timeLabel}: ${item.title}`)] : []),
    ...(picks.vendors.length ? ["", "Food & vendors to visit", ...picks.vendors.map((vendor) => `${vendor.name}\n${fairVendorShareUrl(origin, vendor.id)}`)] : []),
    "",
    "Check the Fair guide for current details. These picks are not reservations.",
    new URL(FAIR_DAY_PATH, origin).toString(),
  ].join("\n");
}

export default function FairPlanShareButton(picks: FairPicksShare) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current); }, []);

  const share = async () => {
    const text = fairPicksShareText(window.location.origin, picks);
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: `My Fair picks for ${picks.dateLabel}`, text });
        return;
      } catch (error) {
        if ((error as { name?: string } | null)?.name === "AbortError") return;
      }
    }
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Fair picks copied.");
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      window.prompt("Copy your saved Fair stops:", text);
    }
  };

  if (!picks.scheduleItems.length && !picks.vendors.length) return null;
  return <div className="mt-3">
    <Button variant="secondary" onClick={share} iconLeft={copied ? <Check className="h-4 w-4" aria-hidden /> : <Share2 className="h-4 w-4" aria-hidden />}>
      {copied ? "Picks copied" : "Share saved stops"}
    </Button>
    <span className="sr-only" role="status">{copied ? "Fair picks copied." : ""}</span>
  </div>;
}
