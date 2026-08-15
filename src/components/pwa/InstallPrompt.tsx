"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Check,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  Share2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import RippleMark from "@/components/brand/RippleMark";
import { Button } from "@/components/ui/Button";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { isInstallPromptSuppressedPath } from "@/lib/pwa-display";
import { safeReturnLink } from "@/lib/return-bridge";

async function copyLink(url: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      return true;
    }
  } catch {
    // Some embedded browsers expose Clipboard but reject it. Use the selection fallback.
  }
  let input: HTMLTextAreaElement | null = null;
  try {
    input = document.createElement("textarea");
    input.value = url;
    input.readOnly = true;
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    input?.remove();
  }
}

/**
 * One non-blocking return path. Automatic offers stay out of focused map and
 * detail work; a deliberate Saved/Compass/Settings action can always open it.
 */
export default function InstallPrompt() {
  const pathname = usePathname();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [blockingModalOpen, setBlockingModalOpen] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const {
    show,
    surface,
    embeddedApp,
    manual,
    prompting,
    promptInstall,
    dismiss,
    acknowledgeInstalled,
    completeAlternative,
    recordOfferShown,
  } = useInstallPrompt();

  const suppressed = isInstallPromptSuppressedPath(pathname) && !manual;
  const visible = show && !suppressed && !blockingModalOpen;

  useEffect(() => {
    document.documentElement.dataset.returnBridgeReady = "true";
    return () => {
      delete document.documentElement.dataset.returnBridgeReady;
    };
  }, []);

  useEffect(() => {
    if (visible) recordOfferShown();
  }, [recordOfferShown, visible]);

  useEffect(() => {
    const update = () => {
      setBlockingModalOpen(
        Boolean(document.querySelector('[role="dialog"][aria-modal="true"]')),
      );
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: ["aria-modal", "role"],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !manual) return;
    const active = document.activeElement;
    returnFocusRef.current =
      active instanceof HTMLElement && active !== document.body ? active : null;
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return;
      event.preventDefault();
      dismiss();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
      const returnTo = returnFocusRef.current;
      returnFocusRef.current = null;
      const modalNowOpen = document.querySelector(
        '[role="dialog"][aria-modal="true"]',
      );
      if (returnTo?.isConnected && !modalNowOpen) {
        returnTo.focus({ preventScroll: true });
      }
    };
  }, [dismiss, manual, visible]);

  if (!visible) return null;

  const currentLink = () =>
    safeReturnLink(window.location.href) || "https://frederickradius.app/today";

  const handleCopy = async () => {
    if (!(await copyLink(currentLink()))) {
      toast.error("The link could not be copied. Try your browser's Share menu.");
      return;
    }
    toast.success("Frederick Radius link copied.");
    completeAlternative("copy");
  };

  const embedded = surface === "embedded-ios" || surface === "embedded-android";
  const showCopyFallback = embedded || surface === "desktop";
  const manualInstall =
    surface === "ios-safari"
    || surface === "ios-chrome"
    || surface === "ios-browser"
    || surface === "mobile-browser";
  const compactAutomatic = !manual && !instructionsOpen;
  const closePrompt = () => {
    setInstructionsOpen(false);
    dismiss();
  };

  return (
    <aside
      ref={panelRef}
      aria-labelledby="keep-radius-title"
      aria-live="polite"
      data-return-bridge
      data-surface={surface}
      data-offer-mode={compactAutomatic ? "compact" : "instructions"}
      className="pop-in fixed z-[var(--z-prompt)] mx-auto max-w-sm overflow-y-auto overscroll-contain rounded-[var(--app-radius-lg)] border backdrop-blur-md"
      style={{
        left: "max(0.75rem, env(safe-area-inset-left, 0px))",
        right: "max(0.75rem, env(safe-area-inset-right, 0px))",
        bottom: "calc(env(safe-area-inset-bottom, 0px) + var(--app-bottomnav-reserve, 0px) + 68px)",
        maxHeight: "calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - var(--app-bottomnav-reserve, 0px) - 80px)",
        borderColor: "var(--app-border)",
        background: "var(--app-bg-elevated-solid)",
        boxShadow: "var(--app-elev-3), var(--app-hi)",
      }}
    >
      <button
        ref={closeButtonRef}
        type="button"
        onClick={closePrompt}
        aria-label={manual ? "Close Keep Radius" : "Dismiss Keep Radius"}
        className="tactile-interactive absolute right-1 top-1 grid h-11 w-11 place-items-center rounded-full transition active:scale-[0.9]"
        style={{ color: "var(--app-ink-3)" }}
      >
        <X className="h-4 w-4" strokeWidth={2} aria-hidden />
      </button>

      <div className="p-4">
        <div className="flex items-center gap-3 pr-10">
          <RippleMark size={40} tile detail="full" className="shrink-0" />
          <p
            id="keep-radius-title"
            className="min-w-0 font-sans text-[17px] font-semibold leading-tight"
            style={{ color: "var(--app-ink)" }}
          >
            {compactAutomatic
              ? "Keep Radius close"
              : surface === "desktop"
                ? "Put Radius on your phone"
                : "Add Radius to your Home Screen"}
          </p>
        </div>

        <div className="mt-3 min-w-0">
          {compactAutomatic ? (
            <>
              <p className="text-meta-lg leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
                Add Radius to your Home Screen when you want a faster way back.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {surface === "native" ? (
                  <Button
                    onClick={promptInstall}
                    loading={prompting}
                    size="md"
                    iconLeft={<Download className="h-4 w-4" strokeWidth={2.25} aria-hidden />}
                  >
                    {prompting ? "Opening…" : "Add to Home Screen"}
                  </Button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setInstructionsOpen(true)}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--app-radius-sm)] px-3 text-[12px] font-semibold"
                    style={{ background: "var(--app-brand)", color: "var(--app-on-brand)" }}
                  >
                    How to add it
                    <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
                  </button>
                )}
                <button
                  type="button"
                  onClick={closePrompt}
                  className="inline-flex min-h-11 items-center px-2 text-[12px] font-semibold"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  Not now
                </button>
              </div>
            </>
          ) : surface === "native" ? (
            <>
              <p className="mt-1 text-meta-lg leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
                Add Radius to your Home Screen for one-tap access to your saved
                places and live local tools.
              </p>
              <Button
                onClick={promptInstall}
                loading={prompting}
                size="md"
                className="mt-3"
                iconLeft={<Download className="h-4 w-4" strokeWidth={2.25} aria-hidden />}
              >
                {prompting ? "Opening…" : "Add to Home Screen"}
              </Button>
            </>
          ) : surface === "ios-safari" ? (
            <>
              <p className="mt-1 text-meta-lg leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
                In Safari, tap Share, choose Add to Home Screen, keep Open as Web
                App on, then tap Add.
              </p>
              <Step icon={<Share2 className="h-4 w-4" aria-hidden />}>
                Share <ChevronRight className="inline h-3 w-3" aria-hidden />
                Add to Home Screen
                <ChevronRight className="inline h-3 w-3" aria-hidden /> Add
              </Step>
            </>
          ) : surface === "ios-chrome" ? (
            <>
              <p className="mt-1 text-meta-lg leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
                In Chrome, tap Share beside the address bar, choose Add to Home
                Screen, then tap Add.
              </p>
              <Step icon={<Share2 className="h-4 w-4" aria-hidden />}>
                Share <ChevronRight className="inline h-3 w-3" aria-hidden />
                Add to Home Screen
                <ChevronRight className="inline h-3 w-3" aria-hidden /> Add
              </Step>
            </>
          ) : surface === "ios-browser" ? (
            <>
              <p className="mt-1 text-meta-lg leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
                Open this browser&rsquo;s Share menu and look for Add to Home Screen.
                If it is missing, open this page in Safari.
              </p>
              <Step icon={<Share2 className="h-4 w-4" aria-hidden />}>
                Share <ChevronRight className="inline h-3 w-3" aria-hidden />
                Add to Home Screen
              </Step>
            </>
          ) : embedded ? (
            <>
              <p className="mt-1 text-meta-lg leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
                {embeddedApp} cannot add Radius directly. Open this page in your
                phone&rsquo;s browser, then choose Add to Home Screen.
              </p>
              <Step icon={<ExternalLink className="h-4 w-4" aria-hidden />}>
                Open in browser
                <ChevronRight className="inline h-3 w-3" aria-hidden />
                Add to Home Screen
              </Step>
            </>
          ) : surface === "mobile-browser" ? (
            <>
              <p className="mt-1 text-meta-lg leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
                Open this browser&rsquo;s menu and choose Install app or Add to Home
                Screen.
              </p>
              <Step icon={<Download className="h-4 w-4" aria-hidden />}>
                Browser menu
                <ChevronRight className="inline h-3 w-3" aria-hidden /> Install app
              </Step>
            </>
          ) : (
            <div className="mt-3 flex items-center gap-3">
              <Image
                src="/brand/return-bridge-qr.svg"
                alt="QR code for Frederick Radius"
                width={96}
                height={96}
                className="rounded-[var(--app-radius-sm)] border bg-white p-1"
                style={{ borderColor: "var(--app-border)" }}
              />
              <p className="text-meta-lg leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
                Scan with your phone, then choose Add to Home Screen in its
                browser. You can also bookmark or copy this page.
              </p>
            </div>
          )}

          {!compactAutomatic ? (
            <div
              data-install-prompt-footer
              className="mt-3 flex flex-wrap items-center gap-2"
            >
              {manualInstall ? (
              <button
                type="button"
                onClick={acknowledgeInstalled}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--app-radius-sm)] px-3 text-[12px] font-semibold"
                style={{ background: "var(--app-brand)", color: "var(--app-on-brand)" }}
              >
                <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                I added Radius
              </button>
              ) : null}
              {showCopyFallback ? (
              <button
                type="button"
                onClick={() => void handleCopy()}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--app-radius-sm)] border px-3 text-[12px] font-semibold"
                style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
              >
                <Copy className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                Copy link
              </button>
              ) : null}
              <button
                type="button"
                onClick={closePrompt}
                className="inline-flex min-h-11 items-center px-2 text-[12px] font-semibold"
                style={{ color: "var(--app-ink-3)" }}
              >
                {manual ? "Close" : "Not now"}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

function Step({
  icon,
  children,
}: {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className="mt-3 flex items-center gap-2 rounded-[var(--app-radius-md)] border p-3 text-[12px] leading-relaxed"
      style={{
        borderColor: "var(--app-border)",
        background: "var(--app-bg-subtle)",
        color: "var(--app-ink-2)",
      }}
    >
      <span className="shrink-0" style={{ color: "var(--app-brand)" }}>
        {icon}
      </span>
      <span>{children}</span>
    </div>
  );
}
