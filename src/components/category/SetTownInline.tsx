"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MapPin } from "lucide-react";
import { setHomeMuni } from "@/lib/personalize";

/**
 * SetTownInline — the "set your town" affordance for context-aware
 * category pages. Writes the home municipality (localStorage + the
 * `fr_home_muni` cookie the server page reads) and refreshes so the page
 * re-ranks from the chosen town. No geolocation prompt — a deliberate
 * choice for the no-location pilot; GPS-nearby can layer on later.
 */
export default function SetTownInline({
  municipalities,
}: {
  municipalities: { slug: string; name: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <label
      className="inline-flex items-center gap-1.5 text-[12px]"
      style={{ color: "var(--app-ink-2)" }}
    >
      <MapPin
        className="h-3.5 w-3.5"
        strokeWidth={2}
        aria-hidden
        style={{ color: "var(--app-brand)" }}
      />
      <span className="font-medium">Set your town</span>
      <select
        aria-label="Set your town for nearby results"
        disabled={busy}
        defaultValue=""
        onChange={(e) => {
          const slug = e.target.value;
          if (!slug) return;
          setBusy(true);
          setHomeMuni(slug);
          router.refresh();
        }}
        className="rounded-md border bg-[var(--app-bg-elevated)] px-2 py-1 text-[12px] font-medium"
        style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
      >
        <option value="" disabled>
          Choose…
        </option>
        {municipalities.map((m) => (
          <option key={m.slug} value={m.slug}>
            {m.name}
          </option>
        ))}
      </select>
    </label>
  );
}
