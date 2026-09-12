"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { Drawer } from "vaul";
import { X } from "lucide-react";
import { usePathname } from "next/navigation";
import { haptic } from "@/lib/haptics";
import { useReversibleHistoryLayer } from "@/hooks/useReversibleHistoryLayer";

type Props = {
  present: boolean;
  onClose: () => void;
  ariaLabel: string;
  historyLayerId?: string;
  returnFocusRef?: RefObject<HTMLElement | null>;
  maxHeight?: string;
  children: (dismiss: () => void) => ReactNode;
};

type Context = {
  sheetId: string;
};

const BottomSheetContext = createContext<Context | null>(null);

export function useSheet() {
  const ctx = useContext(BottomSheetContext);
  if (!ctx) throw new Error("useSheet must be used inside a BottomSheet");
  return ctx;
}

export function SheetHandle({
  onClose,
  closeLabel = "Close",
}: {
  onClose: () => void;
  closeLabel?: string;
}) {
  return (
    <div className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-end px-3">
      <div className="pointer-events-none absolute inset-0 rounded-t-[14px]" style={{ background: "var(--app-bg-surface)" }} />
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-4 bg-gradient-to-t from-transparent" style={{ "--tw-gradient-to": "var(--app-bg-surface)" } as React.CSSProperties} />
      
      {/* Handle pill for iOS-like affordance */}
      <div className="absolute left-1/2 top-3 -translate-x-1/2 h-1.5 w-12 rounded-full" style={{ background: "var(--app-bg-sunken)" }} />

      <button
        onClick={() => {
          haptic("light");
          onClose();
        }}
        aria-label={closeLabel}
        className="tap-44-xy relative z-10 grid h-8 w-8 place-items-center rounded-full transition active:scale-95"
        style={{
          background: "var(--app-bg-elevated)",
          color: "var(--app-ink)",
          boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
        }}
      >
        <X className="h-5 w-5" strokeWidth={2.25} />
      </button>
    </div>
  );
}

export default function BottomSheet({
  present,
  onClose,
  ariaLabel,
  historyLayerId,
  returnFocusRef,
  children,
}: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(present);
  const onCloseRef = useRef(onClose);
  const openPath = useRef(pathname);
  
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const historyLayer = useReversibleHistoryLayer({
    active: open && present && Boolean(historyLayerId),
    id: historyLayerId ?? "",
    onDismiss: () => setOpen(false),
  });

  const dismiss = useCallback(() => {
    haptic("light");
    historyLayer.dismiss();
  }, [historyLayer]);

  useEffect(() => {
    if (present) {
      openPath.current = window.location.pathname;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs sheet-open state to the incoming presence prop
      setOpen(true);
      haptic("light");
    } else {
      setOpen(false);
    }
  }, [present]);

  return (
    <Drawer.Root
      open={open && present}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          dismiss();
          returnFocusRef?.current?.focus();
        }
      }}
      shouldScaleBackground
      disablePreventScroll={false}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm transition-opacity" />
        <Drawer.Content
          aria-label={ariaLabel}
          className="fixed bottom-0 left-0 right-0 z-[101] mt-24 flex max-h-[96dvh] flex-col rounded-t-[14px] outline-none"
          style={{ 
            background: "var(--app-bg-surface)", 
            boxShadow: "0 -4px 24px rgba(0,0,0,0.15)",
            // Override Vaul's internal animation curve for a softer, more spring-like iOS feel
            "--transition-duration": "0.45s",
            "--transition-timing-function": "cubic-bezier(0.2, 0.8, 0.2, 1)"
          } as React.CSSProperties}
        >
          <BottomSheetContext.Provider value={{ sheetId: historyLayerId ?? "" }}>
            {children(dismiss)}
          </BottomSheetContext.Provider>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
