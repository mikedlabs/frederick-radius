import { readFileSync } from "node:fs";
import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import LazySheetFallback from "./LazySheetFallback";

describe("lazy dialog boundaries", () => {
  it("keeps place and event detail implementations in on-demand chunks", () => {
    const placeProvider = readFileSync(
      "src/components/place/PlaceSheetProvider.tsx",
      "utf8",
    );
    const eventProvider = readFileSync(
      "src/components/event/EventSheetProvider.tsx",
      "utf8",
    );

    expect(placeProvider).toContain(
      'const PlaceSheet = lazy(() => import("./PlaceSheet"))',
    );
    expect(placeProvider).not.toContain('import PlaceSheet from "./PlaceSheet"');
    expect(eventProvider).toContain(
      'const EventSheet = lazy(() => import("./EventSheet"))',
    );
    expect(eventProvider).not.toContain('import EventSheet from "./EventSheet"');
  });

  it("renders a modal, dismissible sheet silhouette during a slow first load", () => {
    const html = renderToStaticMarkup(
      createElement(LazySheetFallback, {
        label: "Loading Gravel and Grind",
        onClose: vi.fn(),
        returnFocusRef: createRef<HTMLElement>(),
      }),
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-label="Loading Gravel and Grind"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain("Close");
    expect(html).toContain('role="status"');
  });

  it("preserves the real dialog contracts across the fallback-to-chunk swap", () => {
    const fallback = readFileSync(
      "src/components/ui/LazySheetFallback.tsx",
      "utf8",
    );
    const bottomSheet = readFileSync(
      "src/components/ui/BottomSheet.tsx",
      "utf8",
    );

    expect(fallback).toContain("useFocusTrap(dialogRef, true)");
    expect(fallback).toContain('document.body.style.overflow = "hidden"');
    expect(fallback).toContain('event.key !== "Escape"');
    expect(fallback).toContain("returnFocusRef.current?.focus?.()");
    expect(bottomSheet).toContain("const [open, setOpen] = useState(present)");
    expect(bottomSheet).toContain("returnFocusRef?.current ??");
    expect(bottomSheet).toContain("createPortal(");
    expect(bottomSheet).toContain("bg-[var(--app-bg-elevated-solid)]");
  });
});
