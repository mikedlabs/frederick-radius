import type { ReactNode } from "react";

function focusReceipt(heading: HTMLHeadingElement | null) {
  heading?.focus();
}

/** The submit button disappears on success. Move focus to the result once. */
export default function SubmissionReceiptHeading({ children, className }: { children: ReactNode; className: string }) {
  return (
    <h2 ref={focusReceipt} tabIndex={-1} className={className} style={{ color: "var(--app-ink)" }}>
      {children}
    </h2>
  );
}
