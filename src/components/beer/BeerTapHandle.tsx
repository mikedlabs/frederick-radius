"use client";

import { forwardRef, type CSSProperties, type KeyboardEventHandler } from "react";
import { BreweryLogo } from "./BreweryLogo";
import BeerPourPreview from "./BeerPourPreview";
import styles from "./BeerTaproomBoard.module.css";

type HandleShape = "paddle" | "medallion" | "shield" | "porcelain";
type HandleFinish = "walnut" | "blackened" | "brass" | "maple";

type HandleVisual = {
  shape: HandleShape;
  finish: HandleFinish;
};

const HANDLE_VISUALS: Readonly<Record<string, HandleVisual>> = {
  "olde-mother-brewing-frederick": { shape: "shield", finish: "blackened" },
  "attaboy-beer-frederick": { shape: "paddle", finish: "maple" },
  "steinhardt-brewing-company-frederick": { shape: "medallion", finish: "brass" },
  "rockwell-brewery-frederick": { shape: "paddle", finish: "walnut" },
  "monocacy-brewing-frederick": { shape: "shield", finish: "brass" },
  "brewers-alley-frederick": { shape: "porcelain", finish: "walnut" },
  "sandbox-brewhouse-frederick": { shape: "medallion", finish: "blackened" },
  "rak-brewing-co-frederick": { shape: "shield", finish: "maple" },
  "smoketown-brewing-brunswick": { shape: "paddle", finish: "brass" },
  "midnight-run-brewing": { shape: "porcelain", finish: "blackened" },
  "prospect-point-brewing-frederick": { shape: "paddle", finish: "walnut" },
  "brudr-bier-co-frederick": { shape: "shield", finish: "blackened" },
  "springfield-manor-thurmont": { shape: "medallion", finish: "brass" },
  "freys-farm-mount-airy": { shape: "paddle", finish: "maple" },
  "liquidity-aleworks-mount-airy": { shape: "porcelain", finish: "brass" },
  "milkhouse-brewery-mt-airy": { shape: "shield", finish: "walnut" },
  "red-shedman-farm-brewery-and-hop-yard-mount-airy": { shape: "medallion", finish: "blackened" },
};

type BeerTapHandleProps = {
  brewerySlug: string;
  breweryName: string;
  town: string;
  selected: boolean;
  listedOpen: boolean;
  pourColor: string;
  eagerLogo?: boolean;
  controlsId: string;
  onSelect: () => void;
  onKeyDown: KeyboardEventHandler<HTMLButtonElement>;
};

const BeerTapHandle = forwardRef<HTMLButtonElement, BeerTapHandleProps>(
  function BeerTapHandle(
    {
      brewerySlug,
      breweryName,
      town,
      selected,
      listedOpen,
      pourColor,
      eagerLogo = false,
      controlsId,
      onSelect,
      onKeyDown,
    },
    ref,
  ) {
    const visual = HANDLE_VISUALS[brewerySlug] ?? { shape: "paddle", finish: "walnut" };
    const style = { "--tap-pour": pourColor } as CSSProperties;

    return (
      <button
        ref={ref}
        id={`tap-handle-${brewerySlug}`}
        type="button"
        role="tab"
        aria-selected={selected}
        aria-controls={controlsId}
        tabIndex={selected ? 0 : -1}
        aria-label={`${breweryName}, ${town}. ${listedOpen ? "Listed hours say open." : "Current hours are not confirmed."}`}
        onClick={onSelect}
        onKeyDown={onKeyDown}
        className={`${styles.tapButton} ${selected ? styles.tapButtonSelected : ""}`}
        style={style}
      >
        <span className={styles.tapAssembly}>
          <span className={`${styles.handle} ${styles[visual.shape]} ${styles[visual.finish]}`}>
            <span className={styles.logoWell}>
              <BreweryLogo
                brewerySlug={brewerySlug}
                breweryName={breweryName}
                decorative
                sizes="88px"
                loading={eagerLogo ? "eager" : "lazy"}
                className={styles.logo}
              />
            </span>
            <span className={styles.handleNeck} aria-hidden />
          </span>

          <span className={styles.faucet} aria-hidden>
            <span className={`${styles.ferrule} ${listedOpen ? styles.ferruleOpen : styles.ferruleUnknown}`} />
            <span className={styles.faucetBody} />
            <span className={styles.spout} />
          </span>

          {selected ? <BeerPourPreview color={pourColor} /> : null}
        </span>

        <span className={styles.tapName}>{breweryName}</span>
        <span className={styles.tapMeta}>{listedOpen ? "Listed open" : town}</span>
      </button>
    );
  },
);

export default BeerTapHandle;
