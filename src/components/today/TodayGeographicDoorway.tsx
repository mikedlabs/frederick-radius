"use client";

import { useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getScope, parseScope, scopeTownSlug, subscribeScopeChange, type Scope } from "@/lib/scope";
import styles from "./TodayLayout.module.css";

const subscribe = (listener: () => void) => subscribeScopeChange(() => listener());

/** This owned scene shows Frederick, not whichever municipality is selected. */
export function todayShowsFrederickDoorway(scope: Scope | null): boolean {
  const parsed = parseScope(scope);
  if (parsed === "nearme") return false;
  const town = scopeTownSlug(parsed);
  return town === null || town === "frederick";
}

/** Reserve county geometry while the URL lens is unknown, without a place claim. */
export function TodayGeographicDoorwayPending() {
  return (
    <div data-today-geographic-pending aria-hidden="true" className={styles.geographicDoorway}>
      <div className={styles.geographicPhoto} />
    </div>
  );
}

/** A geographic browsing action, never a claim that the park is open or safe now. */
export function TodayGeographicDoorwayView({ scope = null }: { scope?: Scope | null }) {
  const [imageState, setImageState] = useState<"pending" | "loaded" | "failed">("pending");
  if (!todayShowsFrederickDoorway(scope)) return null;

  return (
    <Link
      href="/places/carroll-creek-linear-park-frederick"
      prefetch={false}
      aria-label="View Carroll Creek Linear Park in Frederick"
      data-today-geographic-doorway
      data-photo-state={imageState}
      className={styles.geographicDoorway}
    >
      {imageState !== "failed" && (
        <figure className={styles.geographicPhoto} data-today-photo-lead>
          <Image
            src="/images/seasons/summer/SUMMER CARROL CREEK.jpg"
            alt="Carroll Creek in Frederick."
            fill
            sizes="(min-width: 640px) 520px, calc(100vw - 32px)"
            loading="eager"
            onLoad={(event) => {
              const image = event.currentTarget;
              const usable = image.naturalWidth > 1 && image.naturalHeight > 1;
              setImageState((current) => current === "failed" ? current : usable ? "loaded" : "failed");
            }}
            onError={() => setImageState("failed")}
          />
        </figure>
      )}
      <div className={styles.geographicCaption} data-today-geographic-caption>
        <div>
          <h2>Carroll Creek</h2>
          <p>Frederick</p>
        </div>
        <span className={styles.geographicAction}>View place <ArrowRight aria-hidden className="h-4 w-4" /></span>
      </div>
    </Link>
  );
}

/** Match the existing shared lens: a validated URL wins over stored scope. */
export default function TodayGeographicDoorway() {
  const storedScope = useSyncExternalStore(subscribe, getScope, () => null);
  const searchParams = useSearchParams();
  const scope = parseScope(searchParams.get("in")) ?? storedScope;
  return <TodayGeographicDoorwayView scope={scope} />;
}
