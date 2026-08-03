import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import {
  resetFollowsSyncFlag,
  useFollowedSlugs,
  type FollowedSlugsBootstrap,
} from "./useFollows";

function FollowSnapshot({ bootstrap }: { bootstrap: FollowedSlugsBootstrap }) {
  const state = useFollowedSlugs(bootstrap);
  return createElement(
    "output",
    {
      "data-authed": String(state.authed),
      "data-loading": String(state.loading),
    },
    [...state.slugs].sort().join(","),
  );
}

describe("useFollowedSlugs server bootstrap", () => {
  afterEach(() => resetFollowsSyncFlag());

  it("renders verified account follows without a client loading waterfall", () => {
    const html = renderToStaticMarkup(
      createElement(FollowSnapshot, {
        bootstrap: {
          user: { id: "account-a", email: "local@example.com" },
          slugs: ["gravel-and-grind", "beans-and-bagels"],
        },
      }),
    );

    expect(html).toContain('data-authed="true"');
    expect(html).toContain('data-loading="false"');
    expect(html).toContain("beans-and-bagels,gravel-and-grind");
  });

  it("keeps a failed server follow read in an honest loading state", () => {
    const html = renderToStaticMarkup(
      createElement(FollowSnapshot, {
        bootstrap: {
          user: { id: "account-a", email: null },
        },
      }),
    );

    expect(html).toContain('data-authed="true"');
    expect(html).toContain('data-loading="true"');
  });

  it("renders an anonymous device without waiting for an auth request", () => {
    const html = renderToStaticMarkup(
      createElement(FollowSnapshot, {
        bootstrap: { user: null },
      }),
    );

    expect(html).toContain('data-authed="false"');
    expect(html).toContain('data-loading="false"');
  });
});

