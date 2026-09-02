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
      <FairGroundsMapCanvas {...props} />
    </div>
  );
}
