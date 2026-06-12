import type { Metadata } from "next";
import "./theme.css";

export const metadata: Metadata = {
  title: "Field Guide · Direction A",
  robots: { index: false, follow: false },
};

/**
 * Direction A shell. No app chrome: the prototype is judged on its own
 * identity, not the production nav. The .lab-a class scopes every token in
 * theme.css. A single centered column at the mobile measure, because the
 * field guide is a page, not a dashboard.
 */
export default function LabALayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="lab-a min-h-screen">
      <div className="mx-auto min-h-screen max-w-[440px]">{children}</div>
    </div>
  );
}
