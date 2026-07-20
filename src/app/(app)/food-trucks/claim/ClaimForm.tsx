"use client";

import { useState } from "react";

type TruckOption = { slug: string; name: string; kind: "food" | "treats" };

/**
 * ClaimForm — an operator picks their truck and leaves a name + contact. It
 * posts to /api/food-trucks/claim, which stores a PENDING request for the owner
 * to review by hand. No token is issued here; approval is a separate,
 * owner-controlled step. The confirmation copy says exactly that, so nobody
 * expects an instant live pin.
 */
export default function ClaimForm({ trucks }: { trucks: TruckOption[] }) {
  const [truckSlug, setTruckSlug] = useState("");
  const [operatorName, setOperatorName] = useState("");
  const [contact, setContact] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const food = trucks.filter((t) => t.kind === "food");
  const treats = trucks.filter((t) => t.kind === "treats");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!truckSlug || !operatorName.trim() || !contact.trim()) {
      setError("Please pick your truck and add a name and a way to reach you.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/food-trucks/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ truckSlug, operatorName: operatorName.trim(), contact: contact.trim() }),
      });
      if (res.ok) {
        setDone(true);
        return;
      }
      if (res.status === 429) {
        setError("That is a lot of requests at once. Please try again in a little while.");
        return;
      }
      if (res.status === 503) {
        setError("Claims are not set up on this deployment yet. Please try again later.");
        return;
      }
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      setError(`Something went wrong (${d.error ?? res.status}). Please try again.`);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div
        className="rounded-[var(--app-radius-md)] border p-4"
        style={{
          borderColor: "color-mix(in srgb, var(--app-positive) 28%, var(--app-border))",
          background: "color-mix(in srgb, var(--app-positive) 6%, var(--app-bg-elevated))",
        }}
      >
        <h2 className="font-serif text-[18px] font-semibold" style={{ color: "var(--app-ink)" }}>
          Your request is in.
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          The owner reviews every claim by hand and will reach out at the contact you gave. Once
          your claim is approved you get a private link for posting a live pin when you are out.
        </p>
      </div>
    );
  }

  const labelCls = "block font-mono text-[11px] uppercase tracking-[0.08em]";
  const controlCls = "mt-1 w-full rounded-[var(--app-radius-sm)] border px-3 py-2.5 text-[16px]";
  const controlStyle = {
    borderColor: "var(--app-control-border, var(--app-border))",
    background: "var(--app-bg-elevated)",
    color: "var(--app-ink)",
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-[var(--app-radius-md)] border p-4" style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}>
      <label className="block">
        <span className={labelCls} style={{ color: "var(--app-ink-3)" }}>Your truck</span>
        <select
          value={truckSlug}
          onChange={(e) => setTruckSlug(e.target.value)}
          required
          className={`${controlCls} appearance-none`}
          style={controlStyle}
        >
          <option value="">Pick your truck</option>
          <optgroup label="Food trucks">
            {food.map((t) => (
              <option key={t.slug} value={t.slug}>{t.name}</option>
            ))}
          </optgroup>
          <optgroup label="Treats">
            {treats.map((t) => (
              <option key={t.slug} value={t.slug}>{t.name}</option>
            ))}
          </optgroup>
        </select>
      </label>

      <label className="block">
        <span className={labelCls} style={{ color: "var(--app-ink-3)" }}>Your name</span>
        <input
          type="text"
          value={operatorName}
          onChange={(e) => setOperatorName(e.target.value)}
          maxLength={80}
          required
          placeholder="Who runs the truck"
          className={controlCls}
          style={controlStyle}
        />
      </label>

      <label className="block">
        <span className={labelCls} style={{ color: "var(--app-ink-3)" }}>Email or phone</span>
        <input
          type="text"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          maxLength={120}
          required
          placeholder="How the owner can reach you"
          className={controlCls}
          style={controlStyle}
        />
        <span className="mt-1 block text-[11px]" style={{ color: "var(--app-ink-3)" }}>
          This is only used to verify your claim. It never shows on the site.
        </span>
      </label>

      {error ? (
        <p className="text-[12.5px] font-medium" style={{ color: "var(--app-danger)" }} role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="tap-44 w-full rounded-[var(--app-radius-md)] py-2.5 text-[14px] font-semibold disabled:opacity-50"
        style={{ background: "var(--app-brand-press)", color: "var(--app-on-brand, #fff)" }}
      >
        {submitting ? "Sending your request" : "Send claim request"}
      </button>
    </form>
  );
}
