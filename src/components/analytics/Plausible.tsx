import Script from "next/script";
import { plausibleConfig } from "@/lib/analytics";

/**
 * Renders the Plausible script only when NEXT_PUBLIC_PLAUSIBLE_DOMAIN is
 * set. No env -> renders nothing -> zero network, zero overhead. Set
 * NEXT_PUBLIC_PLAUSIBLE_SRC to a self-hosted/proxied path for full data
 * ownership without a code change.
 */
export default function Plausible() {
  const cfg = plausibleConfig({
    domain: process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN,
    src: process.env.NEXT_PUBLIC_PLAUSIBLE_SRC,
  });
  if (!cfg) return null;
  return (
    <Script
      src={cfg.src}
      data-domain={cfg.domain}
      strategy="afterInteractive"
      defer
    />
  );
}
