"use client";

import dynamic from "next/dynamic";

import type { FairGroundsMapProps } from "./FairGroundsMapInner";
import FairGroundsMapLoading from "./FairGroundsMapLoading";

const FairGroundsMapCanvas = dynamic(() => import("./FairGroundsMapInner"), {
  ssr: false,
  loading: () => <FairGroundsMapLoading />,
});

export default function FairGroundsMap(props: FairGroundsMapProps) {
  return (
    <div id="fair-map" className="scroll-mt-4">
      <h1 id="fair-grounds-map-heading" tabIndex={-1} className="sr-only">
        Fairgrounds map
      </h1>
      <FairGroundsMapCanvas {...props} />
    </div>
  );
}
