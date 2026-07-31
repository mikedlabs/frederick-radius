"use client";

import { useState } from "react";

/**
 * Google author avatars are short-lived remote assets. Keep the required
 * author name/link when one expires, but remove the broken-image chrome.
 */
export default function GoogleAuthorAvatar({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) return null;

  return (
    // Google supplies this short-lived author avatar with the attribution.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={20}
      height={20}
      className="h-5 w-5 rounded-full object-cover"
      onError={() => setFailed(true)}
    />
  );
}
