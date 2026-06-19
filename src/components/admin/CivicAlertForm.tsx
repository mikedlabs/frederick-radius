"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

/**
 * Admin form for posting a civic advisory (POST /api/civic-alerts). Minimal by
 * design: the endpoint is the security + validation boundary (admin-gated,
 * requires a future expiresAt), this is just a typed way to hit it. On success
 * it refreshes the page so the new alert shows in the live list above.
 */
const FIELD =
  "w-full rounded-[var(--app-radius-sm)] border px-3 py-2 text-[14px] outline-none focus:border-[var(--app-brand)]";

export default function CivicAlertForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // Default expiry: 7 days out, in the datetime-local shape.
  const [expiresAt, setExpiresAt] = useState(() =>
    new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 16),
  );

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const body = {
      title: String(fd.get("title") ?? ""),
      severity: String(fd.get("severity") ?? "advisory"),
      source: String(fd.get("source") ?? "City of Frederick"),
      url: String(fd.get("url") ?? "") || undefined,
      startsAt: String(fd.get("startsAt") ?? "") || undefined,
      // datetime-local is local wall time; toISOString normalizes to UTC.
      expiresAt: new Date(String(fd.get("expiresAt") ?? "")).toISOString(),
    };
    try {
      const res = await fetch("/api/civic-alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        toast.success("Advisory posted. It is live in Pulse until it expires.");
        (e.target as HTMLFormElement).reset();
        router.refresh();
      } else {
        toast.error(`Could not post: ${data.error ?? res.status}`);
      }
    } catch {
      toast.error("Network error posting the advisory.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3" style={{ color: "var(--app-ink)" }}>
      <label className="grid gap-1 text-[12px] font-semibold">
        Title
        <input
          name="title"
          required
          minLength={4}
          maxLength={200}
          placeholder="Emergency water-main repair on N Market St between 5th and 6th."
          className={FIELD}
          style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1 text-[12px] font-semibold">
          Severity
          <select
            name="severity"
            defaultValue="warning"
            className={FIELD}
            style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
          >
            <option value="info">Info</option>
            <option value="advisory">Advisory</option>
            <option value="warning">Warning</option>
            <option value="emergency">Emergency</option>
          </select>
        </label>
        <label className="grid gap-1 text-[12px] font-semibold">
          Source
          <select
            name="source"
            defaultValue="City of Frederick"
            className={FIELD}
            style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
          >
            <option>City of Frederick</option>
            <option>Frederick County</option>
          </select>
        </label>
      </div>

      <label className="grid gap-1 text-[12px] font-semibold">
        Link (optional .gov page)
        <input
          name="url"
          type="url"
          maxLength={500}
          placeholder="https://www.cityoffrederickmd.gov/CivicAlerts.aspx"
          className={FIELD}
          style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1 text-[12px] font-semibold">
          Starts (optional)
          <input
            name="startsAt"
            type="datetime-local"
            className={FIELD}
            style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
          />
        </label>
        <label className="grid gap-1 text-[12px] font-semibold">
          Expires (required)
          <input
            name="expiresAt"
            type="datetime-local"
            required
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className={FIELD}
            style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={busy}
        className="mt-1 inline-flex h-10 items-center justify-center rounded-full px-4 text-[13px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-60"
        style={{ background: "var(--app-brand)" }}
      >
        {busy ? "Posting…" : "Post advisory"}
      </button>
    </form>
  );
}
