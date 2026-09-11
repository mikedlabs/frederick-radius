export type MapCameraPadding = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type MapCameraPaddingInput = {
  viewportWidth: number;
  viewportHeight: number;
  mapTop: number;
  mapBottom: number;
  dockTop?: number;
  dockBottom?: number;
  contextRailBottom?: number;
  paneTop?: number;
};

/**
 * Keep fitted geography inside the part of the canvas a person can actually
 * see. The map instrument is bottom-mounted below 1024px and top-mounted on
 * desktop, so treating every dock as top furniture can push a county fit
 * almost entirely off a phone.
 */
export function mapCameraPadding({
  viewportWidth,
  viewportHeight,
  mapTop,
  mapBottom,
  dockTop,
  dockBottom,
  contextRailBottom,
  paneTop,
}: MapCameraPaddingInput): MapCameraPadding {
  const compact = viewportWidth < 1024;
  const shortLandscape =
    viewportHeight < 520 && viewportWidth > viewportHeight;

  if (compact) {
    const obstructionTops = [dockTop, paneTop].filter(
      (value): value is number => Number.isFinite(value),
    );
    const obstructionTop =
      obstructionTops.length > 0 ? Math.min(...obstructionTops) : undefined;
    const measuredBottom =
      obstructionTop === undefined
        ? 0
        : Math.max(0, Math.ceil(mapBottom - obstructionTop + 16));
    const fallbackBottom = shortLandscape ? 72 : 84;
    const maximumBottom = Math.max(
      fallbackBottom,
      Math.floor(Math.max(0, mapBottom - mapTop) - 64),
    );

    const measuredTop =
      contextRailBottom === undefined
        ? 0
        : Math.max(0, Math.ceil(contextRailBottom - mapTop + 16));

    return {
      top: Math.max(shortLandscape ? 12 : 20, measuredTop),
      right: 20,
      bottom: Math.min(
        maximumBottom,
        Math.max(fallbackBottom, measuredBottom),
      ),
      left: 20,
    };
  }

  const measuredTop =
    dockBottom === undefined
      ? 0
      : Math.max(0, Math.ceil(dockBottom - mapTop + 16));

  return {
    top: Math.max(96, measuredTop),
    right: 40,
    bottom: 56,
    left: 40,
  };
}
