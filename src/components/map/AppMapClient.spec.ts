import { createElement } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MapLoadFailure } from "./AppMapClient";

describe("MapLoadFailure", () => {
  it("keeps a line-only trail failure honest and self-contained", () => {
    const html = renderToStaticMarkup(
      createElement(MapLoadFailure, {
        height: "420px",
        places: [],
        events: [],
        trailLineOnly: true,
      }),
    );

    expect(html).toContain("The interactive trail map did not load.");
    expect(html).toContain("The trail guide on this page still works.");
    expect(html).toContain("Reload map");
    expect(html).not.toContain("places and events here");
    expect(html).not.toContain("filters");
    expect(html).not.toContain("in this view");
    expect(html).not.toContain("switch back");
  });

  it("covers rejected and never-settling deferred map modules", () => {
    const clientSource = readFileSync(
      "src/components/map/AppMapClient.tsx",
      "utf8",
    );
    const trailsSource = readFileSync(
      "src/components/trails/TrailsMap.tsx",
      "utf8",
    );
    const taproomSource = readFileSync(
      "src/components/beer/TaproomMap.tsx",
      "utf8",
    );

    expect(clientSource).toContain("APP_MAP_CHUNK_TIMEOUT_MS = 15_000");
    expect(clientSource).toContain("markAppMapChunkReady();");
    expect(clientSource).toContain("function loadAppMapModule()");
    expect(clientSource).toContain("export function warmAppMapChunk()");
    expect(clientSource).toContain("() => loadAppMapModule()");
    expect(clientSource).toContain("subscribeToAppMapChunkReady");
    expect(clientSource).toContain("window.setTimeout(");
    expect(clientSource).toContain("handleMapChunkFailure");
    expect(clientSource).toContain("data-map-chunk-failure");
    expect(trailsSource).toContain(
      'import AppMapClient from "@/components/map/AppMapClient"',
    );
    expect(taproomSource).toContain(
      'import AppMapClient from "@/components/map/AppMapClient"',
    );
    expect(trailsSource).not.toContain("dynamic(() => import");
    expect(taproomSource).not.toContain("dynamic(() => import");
  });
});
