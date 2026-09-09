"use client";

import { useState } from "react";
import Image from "next/image";
import CategoryIcon from "@/components/place/CategoryIcon";

/** A failed provider photo becomes a category mark, never a fake photograph. */
export default function SearchResultImage({ src, alt, category, color }: {
  src: string;
  alt: string;
  category: string;
  color: string;
}) {
  const [failed, setFailed] = useState(false);
  const paid = src.startsWith("/api/place-photo");
  const url = paid ? new URL(src, "https://frederickradius.app") : null;
  url?.searchParams.set("fallback", "signal");
  const photoSrc = url ? `${url.pathname}${url.search}` : src;
  return <>
    <span className="absolute inset-0 grid place-items-center" style={{ background: `color-mix(in srgb, ${color} 12%, var(--app-bg))` }}>
      <CategoryIcon slug={category} className="h-5 w-5" style={{ color }} />
    </span>
    {!failed && <Image src={photoSrc} alt={alt} fill unoptimized={paid} sizes="56px" className="object-cover" onError={() => setFailed(true)} onLoad={(event) => {
      if (event.currentTarget.naturalWidth === 1 && event.currentTarget.naturalHeight === 1) setFailed(true);
    }} />}
  </>;
}
