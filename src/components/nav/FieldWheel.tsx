"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { ChevronLeft, MapPin, type LucideIcon } from "lucide-react";
import { RADIUS_TOOL_GROUPS } from "@/data/radius-tools";
import { TOOL_ICONS, TONE_COLOR } from "@/data/radius-tool-icons";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { getHomeMuni } from "@/lib/personalize";

/**
 * /wheel — the Field Wheel.
 *
 * An instrument-style way into the same tool registry the Compass directory
 * uses (RADIUS_TOOL_GROUPS): spin the ring to a section, open it, spin its
 * tools, open one. The ring is a software dial of the list itself — every item
 * is a tick, the current one is the jeweled marker, and the accent arc fills as
 * you move through the list. It shares the app's paper-cream tokens and fonts,
 * so it reads as one surface rather than a gadget bolted onto the page.
 *
 * The visible list is the accessible control: every row is a real button
 * (section) or link (tool), fully keyboard- and screen-reader-navigable. The
 * ring is a pointer enhancement layered on top (and is itself keyboard-operable
 * with arrows/enter/escape). This is a deliberately playful alternate to the
 * audited /compass index, which stays the canonical, searchable hub.
 */

type WheelItem = {
  key: string;
  label: string;
  description: string;
  Icon: LucideIcon;
  color: string;
  /** Set on tool rows — the destination to open. */
  href?: string;
  /** Set on section rows — the group index to drill into. */
  drill?: number;
};

const SWEEP = 286; // degrees of ring the items occupy
const ORIGIN = -143; // first item angle (leaves a gap at the bottom for Menu)
const STEP = 22; // degrees of drag per list step
const R = 45; // item radius in the 100x100 viewBox

const angleOf = (i: number, n: number) =>
  n <= 1 ? 0 : ORIGIN + (i / (n - 1)) * SWEEP;

const ptOf = (a: number, r: number) => {
  const t = ((a - 90) * Math.PI) / 180;
  return { x: 50 + r * Math.cos(t), y: 50 + r * Math.sin(t) };
};

const arcPath = (a0: number, a1: number, r: number) => {
  const s = ptOf(a0, r);
  const e = ptOf(a1, r);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  return `M${s.x.toFixed(2)} ${s.y.toFixed(2)} A${r} ${r} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
};

function subscribeHomeTown(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}
const noHomeTown = () => null;

/** The 11 top-level sections, each summarized from its own tools. */
function sectionItems(): WheelItem[] {
  return RADIUS_TOOL_GROUPS.map((group, idx) => {
    const lead = group.tools.find((tool) => tool.featured) ?? group.tools[0];
    const sub =
      group.tools
        .slice(0, 3)
        .map((tool) => tool.label)
        .join(", ") + (group.tools.length > 3 ? ", and more" : "");
    return {
      key: group.id,
      label: group.label,
      description: sub,
      Icon: TOOL_ICONS[lead.icon],
      color: TONE_COLOR[lead.tone],
      drill: idx,
    };
  });
}

/** The tools inside one section, with the reader's home-town shortcut folded
 *  into "Yours" (client state) exactly as the Compass directory does. */
function toolItems(secIdx: number, homeSlug: string | null): WheelItem[] {
  const group = RADIUS_TOOL_GROUPS[secIdx];
  const items: WheelItem[] = group.tools.map((tool) => ({
    key: tool.id,
    label: tool.label,
    description: tool.description,
    Icon: TOOL_ICONS[tool.icon],
    color: TONE_COLOR[tool.tone],
    href: tool.href,
  }));
  if (group.id === "yours" && homeSlug) {
    const home = MUNICIPALITY_BY_SLUG[homeSlug];
    items.unshift({
      key: "home",
      label: home ? home.name : "Your home town",
      description: "Open the guide for your home area.",
      Icon: MapPin,
      color: TONE_COLOR.brand,
      href: home ? `/m/${home.slug}` : "/settings",
    });
  }
  return items;
}

function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduce(mq.matches);
    sync();
    mq.addEventListener?.("change", sync);
    return () => mq.removeEventListener?.("change", sync);
  }, []);
  return reduce;
}

export default function FieldWheel() {
  const router = useRouter();
  const homeSlug = useSyncExternalStore(subscribeHomeTown, getHomeMuni, noHomeTown);
  const reduce = usePrefersReducedMotion();

  const [level, setLevel] = useState<0 | 1>(0);
  const [sec, setSec] = useState(0);
  const [sel, setSel] = useState(0);
  const [clock, setClock] = useState("");

  const items = useMemo(
    () => (level === 0 ? sectionItems() : toolItems(sec, homeSlug)),
    [level, sec, homeSlug],
  );
  const active = items[sel] ?? items[0];
  const accent = active?.color ?? "var(--app-brand-press)";

  // Refs so the pointer/momentum handlers always read live values without
  // re-binding listeners on every step.
  const selRef = useRef(0);
  const itemsRef = useRef(items);
  const rowsRef = useRef<Array<HTMLElement | null>>([]);
  const wheelRef = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);
  const lastAngle = useRef(0);
  const accum = useRef(0);
  const vel = useRef(0);
  const raf = useRef(0);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  useEffect(() => {
    selRef.current = sel;
    rowsRef.current[sel]?.scrollIntoView({ block: "nearest" });
  }, [sel, level, sec]);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  useEffect(() => {
    const tick = () => {
      try {
        setClock(
          new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
        );
      } catch {
        /* toLocaleTimeString can throw in exotic locales; the dot still shows */
      }
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  const haptic = useCallback((kind: "step" | "select") => {
    if (typeof navigator === "undefined" || !navigator.vibrate) return;
    try {
      navigator.vibrate(kind === "select" ? [0, 16, 24, 16] : 8);
    } catch {
      /* vibrate is best-effort; some browsers reject without a gesture */
    }
  }, []);

  const step = useCallback(
    (dir: number) => {
      const n = itemsRef.current.length;
      const next = Math.max(0, Math.min(n - 1, selRef.current + dir));
      if (next === selRef.current) return false;
      selRef.current = next;
      setSel(next);
      haptic("step");
      return true;
    },
    [haptic],
  );

  const warm = useCallback((href: string) => router.prefetch(href), [router]);

  const drill = useCallback(
    (idx: number) => {
      setSec(idx);
      setLevel(1);
      selRef.current = 0;
      setSel(0);
      haptic("select");
    },
    [haptic],
  );

  const back = useCallback(() => {
    setLevel(0);
    const restored = Math.min(sec, RADIUS_TOOL_GROUPS.length - 1);
    selRef.current = restored;
    setSel(restored);
    haptic("step");
  }, [sec, haptic]);

  const activate = useCallback(
    (idx: number) => {
      const item = itemsRef.current[idx];
      if (!item) return;
      if (item.href) {
        haptic("select");
        router.push(item.href);
      } else if (typeof item.drill === "number") {
        drill(item.drill);
      }
    },
    [router, drill, haptic],
  );

  const turn = useCallback(
    (delta: number) => {
      accum.current += delta;
      while (accum.current >= STEP) {
        if (!step(1)) {
          accum.current = 0;
          vel.current = 0;
          break;
        }
        accum.current -= STEP;
      }
      while (accum.current <= -STEP) {
        if (!step(-1)) {
          accum.current = 0;
          vel.current = 0;
          break;
        }
        accum.current += STEP;
      }
    },
    [step],
  );

  const angleAt = useCallback((e: ReactPointerEvent) => {
    const el = wheelRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    return (
      (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) *
        180) /
      Math.PI
    );
  }, []);

  const norm = (a: number) => {
    a %= 360;
    if (a > 180) a -= 360;
    if (a < -180) a += 360;
    return a;
  };

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      cancelAnimationFrame(raf.current);
      dragging.current = true;
      accum.current = 0;
      vel.current = 0;
      lastAngle.current = angleAt(e);
      try {
        wheelRef.current?.setPointerCapture(e.pointerId);
      } catch {
        /* pointer capture is a nicety, not required */
      }
    },
    [angleAt],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      if (!dragging.current) return;
      const current = angleAt(e);
      const delta = norm(current - lastAngle.current);
      lastAngle.current = current;
      vel.current = delta;
      turn(delta);
    },
    [angleAt, turn],
  );

  const onPointerUp = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    if (reduce || Math.abs(vel.current) <= 3.2) return;
    let v = Math.max(-14, Math.min(14, vel.current));
    const spin = () => {
      if (Math.abs(v) < 0.35) return;
      turn(v);
      v *= 0.935;
      raf.current = requestAnimationFrame(spin);
    };
    spin();
  }, [reduce, turn]);

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        e.preventDefault();
        step(1);
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        step(-1);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        activate(selRef.current);
      } else if (e.key === "Escape" || e.key === "Backspace") {
        e.preventDefault();
        back();
      }
    },
    [step, activate, back],
  );

  const n = items.length;
  const handle = ptOf(angleOf(sel, n), R);
  const progD = n > 1 && sel > 0 ? arcPath(angleOf(0, n), angleOf(sel, n), R) : "";
  const ActiveIcon = active?.Icon ?? MapPin;
  const title = level === 0 ? "Frederick Radius" : RADIUS_TOOL_GROUPS[sec].label;

  const intentProps = (href: string) => ({
    onMouseEnter: () => warm(href),
    onFocus: () => warm(href),
    onPointerDown: () => warm(href),
  });

  return (
    <div className={`fw${reduce ? " fw-reduce" : ""}`} style={{ ["--fw-acc" as string]: accent }}>
      <FieldWheelStyles />

      <header className="fw-masthead">
        <p className="fw-eyebrow">Frederick County · the wheel</p>
        <h1 className="fw-title">Spin to what you need.</h1>
        <p className="fw-lede">
          Turn the ring to a section, open it, then turn again to a tool. The same list you
          spin is the one you read.
        </p>
      </header>

      <div className="fw-instrument">
        <div className={`fw-appbar${level === 1 ? " fw-deep" : ""}`}>
          <button className="fw-back" type="button" aria-label="Back to sections" onClick={back}>
            <ChevronLeft size={18} strokeWidth={2.1} aria-hidden />
          </button>
          <span className="fw-appbar-title">{title}</span>
          <span className="fw-rt">
            <span>{clock || "··:··"}</span>
            <span className="fw-live" aria-hidden />
          </span>
        </div>

        <ul className="fw-list" aria-label={level === 0 ? "Sections" : `${title} tools`}>
          {items.map((item, idx) => {
            const selected = idx === sel;
            const rowClass = `fw-row${selected ? " fw-sel" : ""}`;
            const inner = (
              <>
                <span className="fw-ic" aria-hidden>
                  <item.Icon size={17} strokeWidth={1.9} />
                </span>
                <span className="fw-body">
                  <span className="fw-lab">{item.label}</span>
                  <span className="fw-sub">{item.description}</span>
                </span>
                <span className="fw-cue" aria-hidden>
                  {item.href ? "Open ›" : "›"}
                </span>
              </>
            );
            return (
              <li key={item.key}>
                {item.href ? (
                  <Link
                    href={item.href}
                    prefetch={false}
                    ref={(el) => {
                      rowsRef.current[idx] = el;
                    }}
                    className={rowClass}
                    style={{ ["--fw-tc" as string]: item.color }}
                    aria-current={selected ? "true" : undefined}
                    {...intentProps(item.href)}
                  >
                    {inner}
                  </Link>
                ) : (
                  <button
                    type="button"
                    ref={(el) => {
                      rowsRef.current[idx] = el;
                    }}
                    className={rowClass}
                    style={{ ["--fw-tc" as string]: item.color }}
                    onClick={() => (typeof item.drill === "number" ? drill(item.drill) : undefined)}
                  >
                    {inner}
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        <div className={`fw-dock${level === 1 ? " fw-deep" : ""}`}>
          <p className="fw-cap">
            {level === 0 ? "Spin the ring · tap a card to open" : "Spin the tools · Menu to go back"}
          </p>
          <div
            className="fw-wheelbox"
            ref={wheelRef}
            role="group"
            aria-label="Selection dial. Use arrow keys to move, Enter to open, Escape to go back."
            tabIndex={0}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={onKeyDown}
          >
            <svg className="fw-ring" viewBox="0 0 100 100" aria-hidden>
              <circle cx="50" cy="50" r={R} fill="none" stroke="var(--app-border)" strokeWidth="1" />
              {progD ? (
                <path
                  d={progD}
                  fill="none"
                  stroke="var(--fw-acc)"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  opacity="0.9"
                />
              ) : null}
              {items.map((item, idx) => {
                const p = ptOf(angleOf(idx, n), R);
                return (
                  <circle
                    key={item.key}
                    cx={p.x.toFixed(2)}
                    cy={p.y.toFixed(2)}
                    r="1.25"
                    fill="var(--app-ink-3)"
                    opacity="0.3"
                  />
                );
              })}
              <circle
                cx={handle.x.toFixed(2)}
                cy={handle.y.toFixed(2)}
                r="3.6"
                fill="var(--app-bg-elevated-solid)"
                stroke="var(--fw-acc)"
                strokeWidth="2.3"
              />
            </svg>

            <button
              className="fw-hub"
              type="button"
              aria-label={active ? `Open ${active.label}` : "Open highlighted"}
              onClick={() => activate(selRef.current)}
            >
              <ActiveIcon size={26} strokeWidth={1.7} aria-hidden />
            </button>

            {level === 1 ? (
              <button className="fw-menu" type="button" onClick={back}>
                Menu
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <p className="fw-hint">Drag the ring · it fills as you move through the list</p>

      <p className="fw-note">
        Prefer the full, searchable index?{" "}
        <Link href="/compass" prefetch={false} className="fw-note-link">
          Open the compass
        </Link>
        .
      </p>
    </div>
  );
}

/** Component-scoped styles. Everything is prefixed `.fw` so it can live inline
 *  next to the markup without a separate stylesheet, and every color is an
 *  --app-* token so the instrument stays in the shipped paper-cream system. */
function FieldWheelStyles() {
  return (
    <style>{`
.fw{--fw-acc:var(--app-brand-press);max-width:420px;margin:0 auto;}
.fw-masthead{text-align:center;padding:0 4px;}
.fw-eyebrow{font-family:var(--font-mono,ui-monospace,monospace);font-size:10px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:var(--app-ink-3);margin:0;}
.fw-title{font-family:var(--font-serif,Georgia,serif);font-weight:600;font-size:clamp(2rem,8vw,2.6rem);line-height:1.02;letter-spacing:-.03em;margin:10px 0 0;color:var(--app-ink);text-wrap:balance;}
.fw-lede{margin:12px auto 0;max-width:34ch;font-size:14px;line-height:1.55;color:var(--app-ink-2);}

.fw-instrument{position:relative;display:flex;flex-direction:column;height:clamp(500px,66vh,660px);margin:22px auto 0;
  background:var(--app-bg-elevated-solid);border:1px solid var(--app-border);border-radius:var(--app-radius-lg,24px);overflow:hidden;
  box-shadow:0 30px 60px -38px rgba(22,22,26,.4), 0 6px 18px -14px rgba(22,22,26,.22);}

.fw-appbar{flex:none;height:52px;display:flex;align-items:center;gap:10px;padding:0 14px;position:relative;border-bottom:1px solid var(--app-border);}
.fw-appbar::after{content:"";position:absolute;left:0;bottom:-1px;height:2px;width:100%;background:linear-gradient(90deg,var(--fw-acc),transparent 70%);opacity:.5;transition:background .4s;}
.fw-back{width:30px;height:30px;display:grid;place-items:center;border:0;background:transparent;color:var(--app-ink-2);border-radius:8px;cursor:pointer;opacity:0;pointer-events:none;transition:opacity .2s;}
.fw-appbar.fw-deep .fw-back{opacity:1;pointer-events:auto;}
.fw-back:focus-visible{outline:2px solid var(--app-brand);outline-offset:2px;}
.fw-appbar-title{flex:1;min-width:0;font-family:var(--font-serif,Georgia,serif);font-weight:600;font-size:17px;letter-spacing:-.015em;color:var(--app-ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.fw-rt{display:flex;align-items:center;gap:6px;font-family:var(--font-mono,ui-monospace,monospace);font-size:10px;font-weight:600;color:var(--app-ink-3);font-variant-numeric:tabular-nums;}
.fw-live{width:6px;height:6px;border-radius:50%;background:var(--fw-acc);}

.fw-list{flex:1;overflow-y:auto;list-style:none;margin:0;padding:6px 0;scrollbar-width:none;}
.fw-list::-webkit-scrollbar{display:none;}
.fw-list li{position:relative;}
.fw-row{display:flex;align-items:center;gap:12px;width:100%;min-height:52px;padding:0 16px;text-align:left;border:0;background:transparent;color:inherit;font:inherit;cursor:pointer;text-decoration:none;
  transition:background .2s,box-shadow .2s,margin .2s,padding .2s;}
.fw-list li + li .fw-row::before{content:"";position:absolute;left:16px;right:16px;top:0;height:1px;background:var(--app-border);}
.fw-row:hover{background:rgba(0,0,0,.02);}
.fw-row:focus-visible{outline:2px solid var(--app-brand);outline-offset:-2px;border-radius:12px;}
.fw-ic{width:30px;height:30px;flex:none;display:grid;place-items:center;border-radius:9px;color:var(--fw-tc);background:color-mix(in srgb,var(--fw-tc) 10%,transparent);transition:all .2s;}
.fw-body{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;}
.fw-lab{font-size:14.5px;font-weight:600;letter-spacing:-.005em;color:var(--app-ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;transition:font-size .2s;}
.fw-sub{max-height:0;opacity:0;overflow:hidden;font-size:12px;line-height:1.35;color:var(--app-ink-2);transition:max-height .24s,opacity .2s,margin .2s;}
.fw-cue{flex:none;font-family:var(--font-mono,ui-monospace,monospace);font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--fw-tc);opacity:0;transition:opacity .2s;}

.fw-row.fw-sel{margin:6px 10px;padding:12px 14px;border-radius:15px;
  background:linear-gradient(180deg,color-mix(in srgb,var(--fw-tc) 13%,var(--app-bg-elevated-solid)),color-mix(in srgb,var(--fw-tc) 5%,var(--app-bg-elevated-solid)));
  box-shadow:0 14px 30px -18px color-mix(in srgb,var(--fw-tc) 65%,transparent), inset 0 0 0 1px color-mix(in srgb,var(--fw-tc) 28%,transparent);}
.fw-row.fw-sel .fw-ic{width:38px;height:38px;background:var(--fw-tc);color:var(--app-on-brand,#fff);box-shadow:0 6px 14px -6px color-mix(in srgb,var(--fw-tc) 70%,transparent);}
.fw-row.fw-sel .fw-lab{font-size:16px;}
.fw-row.fw-sel .fw-sub{max-height:36px;opacity:1;margin-top:3px;}
.fw-row.fw-sel .fw-cue{opacity:1;}
.fw-row.fw-sel::before,.fw-list li + li .fw-row.fw-sel::before{opacity:0;}

.fw-dock{flex:none;height:176px;position:relative;border-top:1px solid var(--app-border);
  background:linear-gradient(180deg,var(--app-bg-elevated-solid),color-mix(in srgb,var(--fw-acc) 4%,var(--app-bg-sunken)));transition:background .5s;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.5);}
.fw-cap{position:absolute;top:9px;left:0;right:0;margin:0;text-align:center;font-family:var(--font-mono,ui-monospace,monospace);font-size:8.5px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--app-ink-3);}
.fw-wheelbox{position:absolute;left:50%;bottom:-64px;transform:translateX(-50%);width:224px;height:224px;touch-action:none;outline:none;}
.fw-wheelbox:focus-visible{outline:none;}
.fw-wheelbox:focus-visible .fw-ring>circle:first-child{stroke:var(--app-brand);}
.fw-ring{width:100%;height:100%;display:block;overflow:visible;cursor:grab;}
.fw-ring:active{cursor:grabbing;}
.fw-hub{position:absolute;left:50%;top:calc(50% - 32px);transform:translate(-50%,-50%);width:82px;height:82px;border-radius:50%;z-index:4;padding:0;
  background:var(--app-bg-elevated-solid);border:1px solid var(--app-border);color:var(--fw-acc);display:grid;place-items:center;cursor:pointer;
  box-shadow:inset 0 2px 5px rgba(22,22,26,.07), inset 0 -1px 0 rgba(255,255,255,.35);transition:transform .12s;}
.fw-hub:active{transform:translate(-50%,-50%) scale(.96);}
.fw-hub:focus-visible{outline:2px solid var(--app-brand);outline-offset:3px;}
.fw-hub svg{transition:color .3s;}
.fw-menu{position:absolute;left:50%;bottom:8px;transform:translateX(-50%);z-index:5;border:1px solid var(--app-border);background:var(--app-bg-elevated-solid);
  border-radius:999px;padding:6px 16px;font-family:var(--font-mono,ui-monospace,monospace);font-size:9px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--app-ink-3);cursor:pointer;}
.fw-menu:hover{color:var(--app-ink-2);}
.fw-menu:focus-visible{outline:2px solid var(--app-brand);outline-offset:2px;}

.fw-hint{margin:14px auto 0;text-align:center;font-family:var(--font-mono,ui-monospace,monospace);font-size:10px;letter-spacing:.03em;color:var(--app-ink-3);}
.fw-note{margin:24px auto 0;text-align:center;font-size:12.5px;color:var(--app-ink-3);}
.fw-note-link{color:var(--app-brand-press);font-weight:600;}

.fw-reduce .fw-row,.fw-reduce .fw-sub,.fw-reduce .fw-ic,.fw-reduce .fw-appbar::after,.fw-reduce .fw-dock,.fw-reduce .fw-hub{transition:none;}
`}</style>
  );
}
