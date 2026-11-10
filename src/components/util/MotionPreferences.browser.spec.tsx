// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MotionConfig, motion } from "framer-motion";
import { afterEach, describe, expect, it, vi } from "vitest";
import MotionPreferences from "./MotionPreferences";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// framer-motion reads the operating-system setting once, on the first motion
// mount, and then follows the query's change event. The stub therefore has to
// exist before any test mounts, and each test flips it through that event.
let osReduce = false;
const reduceQuery = Object.assign(new EventTarget(), { media: "(prefers-reduced-motion)", onchange: null });
Object.defineProperty(reduceQuery, "matches", { get: () => osReduce });
vi.stubGlobal("matchMedia", () => reduceQuery);
function setOsReduce(next: boolean) {
  osReduce = next;
  reduceQuery.dispatchEvent(new Event("change"));
}

// The entrance the app's remaining framer lists use: fade in while rising
// and scaling up.
const HIDDEN = { opacity: 0, y: 10, scale: 0.95 };
const SHOWN = { opacity: 1, y: 0, scale: 1 };
function EnteringList() {
  return (
    <ul>
      {["a", "b", "c"].map((id) => (
        <motion.li
          key={id}
          initial={HIDDEN}
          animate={SHOWN}
          transition={{ type: "spring", bounce: 0, duration: 0.2 }}
        >
          Row {id}
        </motion.li>
      ))}
    </ul>
  );
}

type Frame = { transform: string; opacity: number };
let root: Root | undefined;
let host: HTMLDivElement | undefined;

/** Mounts the list and records every frame framer-motion writes to the first
 *  row until its fade completes. */
async function recordEntrance(wrap: (list: ReactNode) => ReactNode): Promise<Frame[]> {
  host = document.createElement("div");
  document.body.append(host);
  const frames: Frame[] = [];
  const observer = new MutationObserver(() => {
    const row = host!.querySelector("li")!;
    frames.push({ transform: row.style.transform, opacity: Number(row.style.opacity) });
  });
  // React commits the rows with `initial` already on them, exactly as server
  // HTML carries it, and that insert is not a style change. Every record the
  // observer sees is therefore a frame framer-motion painted afterwards.
  observer.observe(host, { attributes: true, subtree: true, attributeFilter: ["style"] });
  root = createRoot(host);
  await act(async () => root!.render(wrap(<EnteringList />)));
  await vi.waitFor(() => expect(frames.at(-1)?.opacity).toBe(1), { timeout: 3000, interval: 16 });
  observer.disconnect();
  return frames;
}
const travelled = (frames: Frame[]) => frames.filter((frame) => frame.transform !== "none");

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  host?.remove();
  setOsReduce(false);
});

describe("MotionPreferences", () => {
  it("has transform none on the first frame under reducedMotion always, while opacity still fades", async () => {
    const frames = await recordEntrance((list) => <MotionConfig reducedMotion="always">{list}</MotionConfig>);

    expect(frames[0].transform).toBe("none");
    expect(travelled(frames)).toEqual([]);
    // The fade is kept: opacity passes through intermediate values to 1.
    expect(frames.some((frame) => frame.opacity > 0 && frame.opacity < 1)).toBe(true);
  });

  it("gives a Reduce Motion visitor that same still entrance through the app wrapper", async () => {
    setOsReduce(true);
    const frames = await recordEntrance((list) => <MotionPreferences>{list}</MotionPreferences>);

    expect(frames[0].transform).toBe("none");
    expect(travelled(frames)).toEqual([]);
    expect(frames.some((frame) => frame.opacity > 0 && frame.opacity < 1)).toBe(true);
  });

  it("leaves motion alone for a visitor who has not asked for less", async () => {
    const frames = await recordEntrance((list) => <MotionPreferences>{list}</MotionPreferences>);

    expect(travelled(frames).length).toBeGreaterThan(1);
  });

  it("is needed: without it framer-motion ignores the Reduce Motion setting", async () => {
    setOsReduce(true);
    const frames = await recordEntrance((list) => list);

    expect(travelled(frames).length).toBeGreaterThan(1);
  });

  it("stays mounted around the whole app shell, sheets and modal slot included", () => {
    const layout = readFileSync("src/app/(app)/layout.tsx", "utf8");
    const open = layout.indexOf("<MotionPreferences>");
    const close = layout.indexOf("</MotionPreferences>");

    expect(open).toBeGreaterThan(-1);
    expect(layout.indexOf("<PlaceSheetProvider>")).toBeGreaterThan(open);
    expect(layout.indexOf("{modal}")).toBeGreaterThan(open);
    expect(close).toBeGreaterThan(layout.indexOf("</PlaceSheetProvider>"));
  });
});
