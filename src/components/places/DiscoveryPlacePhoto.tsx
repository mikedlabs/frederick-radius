"use client";

import Image from "next/image";
import { useState } from "react";
import { getOwnedPlacePhoto, type OwnedPlacePhoto } from "@/lib/owned-place-photos";
import styles from "./DiscoveryPlacePhoto.module.css";

function ReviewedFrame({ photo, sizes }: { photo: OwnedPlacePhoto; sizes: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <span className={styles.frame} data-discovery-photo>
      <Image src={photo.src} alt={photo.alt} width={photo.width} height={photo.height}
        sizes={sizes} loading="eager" style={{ objectPosition: photo.objectPosition }}
        onError={() => setFailed(true)} />
    </span>
  );
}

/** A pictured example must name this exact place. Navigation lives outside
 * the image, so it stays available if local image delivery fails. */
export default function DiscoveryPlacePhoto({ slug, sizes }: { slug: string; sizes: string }) {
  const photo = getOwnedPlacePhoto(slug);
  if (!photo || photo.referenceContext) return null;
  return <ReviewedFrame key={photo.src} photo={photo} sizes={sizes} />;
}
