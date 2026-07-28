"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, MapPin, Loader2, Radio, PackageOpen } from "lucide-react";
import { useGeolocation } from "@/hooks/useGeolocation";

/**
 * OutClient — the operator's "I'm out" console.
 *
 * Token-gated: the token arrives in the claim link's query string, is stored in
 * localStorage so the operator can bookmark this page, and is stripped from the
 * address bar so a shared screenshot does not leak it. On load it resolves the
 * token to the truck (and any pin that is already live). The operator captures
 * their current location, adds a spot label / what's-on note / an "until" time,
 * and posts a beacon. A live pin can be taken down early with one tap.
 *
 * All writes go to /api/food-trucks/beacon, which is the real gate: it revalidates
 * the token against an approved claim, county-locks the pin, and caps expiry.
 */

const TOKEN_KEY = "fr:truck:token";

type LiveInfo = {
  spot: string | null;
  note: string | null;
  minsLeft: number;
  phase: "out" | "wrapping";
  label: string;
  expiresAt: string;
};

type Identity = { truckSlug: string; truckName: string };
type AuthState = "loading" | "ok" | "invalid" | "no-token" | "error";
type Status = { tone: "ok" | "error" | "info"; text: string } | null;

/** "HH:MM" (local) -> an ISO close time. A time already past today is read as
 *  tomorrow. Empty / malformed returns undefined so the server picks the
 *  default window. */
function untilToIso(hhmm: string): string | undefined {
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return undefined;
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d.toISOString();
}

export default function OutClient() {
  const [token, setToken] = useState<string | null>(null);
  const [auth, setAuth] = useState<AuthState>("loading");
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [live, setLive] = useState<LiveInfo | null>(null);

  const [spot, setSpot] = useState("");
  const [note, setNote] = useState("");
  const [until, setUntil] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  const geo = useGeolocation();

  const refresh = useCallback(async (tok: string) => {
    try {
      const res = await fetch(`/api/food-trucks/beacon?token=${encodeURIComponent(tok)}`, { cache: "no-store" });
      if (res.status === 401) {
        setAuth("invalid");
        return;
      }
      if (!res.ok) {
        setAuth("error");
        return;
      }
      const d = (await res.json()) as { truckSlug: string; truckName: string; live: LiveInfo | null };
      setIdentity({ truckSlug: d.truckSlug, truckName: d.truckName });
      setLive(d.live);
      setAuth("ok");
    } catch {
      setAuth("error");
    }
  }, []);

  // Resolve the token once on mount: prefer the query string (a fresh link),
  // fall back to a stored one, then persist + strip it from the URL.
  useEffect(() => {
    let tok: string | null = null;
    try {
      tok = new URLSearchParams(window.location.search).get("token");
      if (!tok) tok = window.localStorage.getItem(TOKEN_KEY);
      if (tok) {
        window.localStorage.setItem(TOKEN_KEY, tok);
        if (window.location.search) window.history.replaceState({}, "", "/food-trucks/out");
      }
    } catch {
      /* private mode: fall through to whatever we read */
    }
    if (!tok) {
      setAuth("no-token");
      return;
    }
    setToken(tok);
    void refresh(tok);
  }, [refresh]);

  const position = geo.state.status === "granted" ? geo.state.position : null;

  const post = useCallback(async () => {
    if (!token || !identity) return;
    if (!position) {
      setStatus({ tone: "error", text: "Tap Use my location first so the pin lands where you are." });
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/food-trucks/beacon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          truckSlug: identity.truckSlug,
          lat: position.lat,
          lng: position.lng,
          spot: spot.trim() || undefined,
          note: note.trim() || undefined,
          until: untilToIso(until),
        }),
      });
      if (res.status === 401) {
        setAuth("invalid");
        return;
      }
      if (res.status === 400) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setStatus({
          tone: "error",
          text:
            d.error === "out-of-bounds"
              ? "That spot is outside Frederick County. The pin only works inside the county."
              : "That did not go through. Check your location and try again.",
        });
        return;
      }
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setStatus({ tone: "error", text: `Could not post (${d.error ?? res.status}). Try again.` });
        return;
      }
      setStatus({ tone: "ok", text: "You are live on the board." });
      await refresh(token);
    } catch {
      setStatus({ tone: "error", text: "Network error. Try again." });
    } finally {
      setBusy(false);
    }
  }, [token, identity, position, spot, note, until, refresh]);

  const packUp = useCallback(async () => {
    if (!token || !identity) return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/food-trucks/beacon", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, truckSlug: identity.truckSlug }),
      });
      if (!res.ok) {
        setStatus({ tone: "error", text: "Could not take the pin down. Try again." });
        return;
      }
      setStatus({ tone: "ok", text: "Your pin is down. You are off the board." });
      await refresh(token);
    } catch {
      setStatus({ tone: "error", text: "Network error. Try again." });
    } finally {
      setBusy(false);
    }
  }, [token, identity, refresh]);

  // ── Auth gates ──────────────────────────────────────────────────────
  if (auth === "loading") {
    return (
      <Shell>
        <p className="inline-flex items-center gap-2 text-[13px]" style={{ color: "var(--app-ink-3)" }}>
          <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} aria-hidden />
          Checking your link
        </p>
      </Shell>
    );
  }
  if (auth === "no-token" || auth === "invalid") {
    return (
      <Shell>
        <h1 className="font-serif text-[22px] font-semibold" style={{ color: "var(--app-ink)" }}>
          This link is not active.
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          You need the private beacon link the owner sends after approving your claim. If you have
          not claimed your truck yet, start there and the owner will follow up.
        </p>
        <a
          href="/food-trucks/claim"
          className="tap-44 mt-4 inline-flex items-center rounded-[var(--app-radius-md)] px-3.5 py-2 text-[13px] font-semibold"
          style={{ background: "var(--app-brand-press)", color: "var(--app-on-brand, #fff)" }}
        >
          Claim your truck
        </a>
      </Shell>
    );
  }
  if (auth === "error" || !identity) {
    return (
      <Shell>
        <p className="text-[13px]" style={{ color: "var(--app-ink-2)" }}>
          Something went wrong loading your console. Please refresh the page.
        </p>
      </Shell>
    );
  }

  // ── The console ─────────────────────────────────────────────────────
  const controlCls = "mt-1 w-full rounded-[var(--app-radius-sm)] border px-3 py-2.5 text-[16px]";
  const controlStyle = {
    borderColor: "var(--app-control-border, var(--app-border))",
    background: "var(--app-bg-elevated)",
    color: "var(--app-ink)",
  };
  const labelCls = "block font-mono text-[11px] uppercase tracking-[0.08em]";

  return (
    <Shell>
      <p className="font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: "var(--app-ink-3)" }}>
        Operator console
      </p>
      <h1 className="mt-1 font-serif text-[24px] font-semibold" style={{ color: "var(--app-ink)" }}>
        {identity.truckName}
      </h1>

      {live ? (
        <div
          className="mt-4 rounded-[var(--app-radius-md)] border p-3.5"
          style={{
            borderColor: "color-mix(in srgb, var(--app-positive) 30%, var(--app-border))",
            background: "color-mix(in srgb, var(--app-positive) 7%, var(--app-bg-elevated))",
          }}
        >
          <p className="inline-flex items-center gap-2 text-[13px] font-semibold" style={{ color: "var(--app-positive)" }}>
            <Radio className="h-4 w-4" strokeWidth={2} aria-hidden />
            {live.label}
          </p>
          {live.spot ? (
            <p className="mt-1 text-[13px]" style={{ color: "var(--app-ink-2)" }}>
              You are showing as parked at {live.spot}.
            </p>
          ) : null}
          <button
            type="button"
            onClick={packUp}
            disabled={busy}
            className="tap-44 mt-3 inline-flex items-center gap-1.5 rounded-[var(--app-radius-md)] border px-3.5 py-2 text-[13px] font-semibold disabled:opacity-50"
            style={{ borderColor: "var(--app-danger)", color: "var(--app-danger)" }}
          >
            <PackageOpen className="h-4 w-4" strokeWidth={2} aria-hidden />
            I&rsquo;m packing up
          </button>
        </div>
      ) : (
        <p className="mt-2 text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          Drop a live pin when you are set up. It shows on the truck board only while you are out,
          and it comes down on its own at your close time.
        </p>
      )}

      {/* Location */}
      <div className="mt-5 space-y-2">
        <span className={labelCls} style={{ color: "var(--app-ink-3)" }}>Your location</span>
        <button
          type="button"
          onClick={geo.request}
          disabled={geo.state.status === "loading"}
          className="tap-44 inline-flex items-center gap-2 rounded-[var(--app-radius-md)] border px-3.5 py-2.5 text-[13px] font-semibold disabled:opacity-60"
          style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)", color: "var(--app-ink)" }}
        >
          {geo.state.status === "loading" ? (
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} aria-hidden />
          ) : (
            <MapPin className="h-4 w-4" strokeWidth={2} aria-hidden style={{ color: "var(--app-brand)" }} />
          )}
          {position ? "Update my location" : "Use my location"}
        </button>
        {position ? (
          <p className="font-mono text-[11px]" style={{ color: "var(--app-ink-3)" }}>
            {position.lat.toFixed(5)}, {position.lng.toFixed(5)} · within {Math.max(1, Math.round(position.accuracy))} m
          </p>
        ) : geo.state.status === "denied" ? (
          <p className="text-[12px]" style={{ color: "var(--app-danger)" }}>
            Location is blocked. Allow location for this site to drop a pin.
          </p>
        ) : geo.state.status === "unavailable" ? (
          <p className="text-[12px]" style={{ color: "var(--app-danger)" }}>
            Your location is not available on this device.
          </p>
        ) : null}
      </div>

      {/* Details */}
      <div className="mt-4 space-y-4">
        <label className="block">
          <span className={labelCls} style={{ color: "var(--app-ink-3)" }}>Spot</span>
          <input
            type="text"
            value={spot}
            onChange={(e) => setSpot(e.target.value)}
            maxLength={80}
            placeholder="Baker Park, west lot"
            className={controlCls}
            style={controlStyle}
          />
        </label>
        <label className="block">
          <span className={labelCls} style={{ color: "var(--app-ink-3)" }}>What&rsquo;s on</span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={160}
            placeholder="Birria and horchata"
            className={controlCls}
            style={controlStyle}
          />
        </label>
        <label className="block">
          <span className={labelCls} style={{ color: "var(--app-ink-3)" }}>Here until</span>
          <input
            type="time"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
            className={controlCls}
            style={controlStyle}
          />
          <span className="mt-1 block text-[11px]" style={{ color: "var(--app-ink-3)" }}>
            Leave this blank for a couple of hours. A pin always comes down within 8 hours.
          </span>
        </label>
      </div>

      {status ? (
        <div className="mt-4">
          <p
            className="text-[13px] font-medium"
            role="status"
            style={{
              color:
                status.tone === "ok"
                  ? "var(--app-positive)"
                  : status.tone === "error"
                    ? "var(--app-danger)"
                    : "var(--app-ink-2)",
            }}
          >
            {status.text}
          </p>
          {status.tone === "ok" && live ? (
            <Link
              href="/food-trucks#near-me"
              className="tap-44 mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-semibold underline underline-offset-4"
              style={{ color: "var(--app-brand-press)" }}
            >
              View on the board
              <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
            </Link>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        onClick={post}
        disabled={busy || !position}
        className="tap-44 mt-4 w-full rounded-[var(--app-radius-md)] py-2.5 text-[14px] font-semibold disabled:opacity-50"
        style={{ background: "var(--app-brand-press)", color: "var(--app-on-brand, #fff)" }}
      >
        {busy ? "Working" : live ? "Update my pin" : "Drop my live pin"}
      </button>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-[100dvh] px-4 py-8" style={{ background: "var(--app-bg)" }}>
      <div className="mx-auto w-full max-w-md">
        <Link
          href="/food-trucks"
          className="tap-44 inline-flex items-center gap-1.5 text-[12.5px] font-semibold"
          style={{ color: "var(--app-ink-2)" }}
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
          Back to food trucks
        </Link>
        <div className="mt-5">{children}</div>
      </div>
    </main>
  );
}
