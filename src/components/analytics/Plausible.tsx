import Script from "next/script";
import { plausibleConfig } from "@/lib/analytics";

/**
 * Renders the site-specific Plausible script only on Vercel's production
 * deployment. The checked-in pa-*.js URL already identifies Frederick Radius,
 * so a second domain setting would add a failure point without adding safety.
 * NEXT_PUBLIC_PLAUSIBLE_SRC remains an override for a future first-party
 * proxy. The queue exists before the network script, so an early interaction
 * cannot disappear while it loads.
 */
export default function Plausible() {
  const cfg = plausibleConfig({
    production: process.env.VERCEL_ENV === "production",
    src: process.env.NEXT_PUBLIC_PLAUSIBLE_SRC,
  });
  if (!cfg) return null;
  return (
    <>
      <Script id="plausible-init" strategy="afterInteractive">
        {`window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)};plausible.init=plausible.init||function(i){plausible.o=i||{}};plausible.init();`}
      </Script>
      <Script
        src={cfg.src}
        strategy="afterInteractive"
        defer
      />
    </>
  );
}
