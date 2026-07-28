import type { Metadata } from "next";
import Link from "next/link";
import SubmitPlaceForm from "@/components/submit/SubmitPlaceForm";

export const metadata: Metadata = {
  robots: { index: false },
  // The root layout already wraps page titles with " · Frederick Radius"
  // via metadata.title.template — including it here would double-suffix
  // ("Submit a place · Frederick Radius · Frederick Radius").
  title: "Submit a place",
  description: "Know a Frederick County place we're missing? Send it our way. We'll verify and add it.",
};

export default async function SubmitPlacePage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;
  const isFoodTruck = category === "food-truck";

  return (
    <div
      className="mx-auto max-w-screen-md px-4"
      style={{
        background: "var(--app-bg)",
        paddingTop: "calc(2rem + env(safe-area-inset-top, 0px))",
        paddingBottom: "calc(2rem + env(safe-area-inset-bottom, 0px))",
      }}
    >
      <Link
        href={isFoodTruck ? "/food-trucks" : "/"}
        className="inline-flex min-h-11 items-center text-xs"
        style={{ color: "var(--app-cool)" }}
      >
        ← {isFoodTruck ? "Back to food trucks" : "Back to Frederick Radius"}
      </Link>
      <header className="mt-4 space-y-2">
        <h1 className="font-serif text-[28px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
          {isFoodTruck ? "Add your food truck" : "Submit a place"}
        </h1>
        <p className="text-[15px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          {isFoodTruck
            ? "Send the basics once. We will verify the truck and contact you before it joins the board."
            : "Know a Frederick County business, park, or venue we’re missing? Tell us. We’ll verify it before publishing."}
        </p>
      </header>
      <SubmitPlaceForm variant={isFoodTruck ? "food-truck" : "place"} />
    </div>
  );
}
