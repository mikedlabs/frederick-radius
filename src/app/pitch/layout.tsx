import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Frederick Radius: Product concept & private-beta overview",
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <div className="marketing-shell min-h-screen">{children}</div>;
}
