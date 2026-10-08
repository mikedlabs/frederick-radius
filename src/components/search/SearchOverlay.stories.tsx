import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import SearchOverlay from "./SearchOverlay";

/** Query-only parent state matches the overlay's real lazy-mount contract.
 * Full header/session/history behavior is covered by the interactive specs. */
function FindWorkshop({ initialQuery = "coffee" }: { initialQuery?: string }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(initialQuery);
  const openerRef = useRef<HTMLElement | null>(null);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <main className="mx-auto max-w-screen-sm space-y-4 p-4">
        <h1 className="text-2xl font-semibold">Find continuity workshop</h1>
        <p className="text-[15px] leading-relaxed">
          This preview uses sample search responses for component review. It does
          not show current places, hours, or source checks.
        </p>
        <Button onClick={(event) => {
          openerRef.current = event.currentTarget;
          setOpen(true);
        }}>
          Open sample Find
        </Button>
      </main>
      {open && (
        <SearchOverlay
          open
          initialQuery={draft}
          onQueryChange={setDraft}
          onClose={close}
          openerRef={openerRef}
          // The workshop must not add entries to Storybook's own route history.
          historyLayerId=""
        />
      )}
    </>
  );
}

function sampleSearch(state: "ready" | "loading" | "error") {
  const originalFetch = window.fetch;
  const cancelPending = new Set<() => void>();
  let reads = 0;
  const fixtureFetch: typeof fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
    if (url.origin !== window.location.origin || url.pathname !== "/api/search") {
      return originalFetch.call(window, input, init);
    }
    reads += 1;
    if (state === "loading") {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
        const cancel = () => {
          cancelPending.delete(cancel);
          signal?.removeEventListener("abort", cancel);
          reject(new DOMException("Sample request cancelled", "AbortError"));
        };
        cancelPending.add(cancel);
        signal?.addEventListener("abort", cancel, { once: true });
        if (signal?.aborted) cancel();
      });
    }
    if (state === "error") return Promise.resolve(new Response("Sample service unavailable", { status: 503 }));
    return Promise.resolve(Response.json({
      results: [{
        type: "place",
        id: "sample-coffee",
        title: "Sample coffee match",
        subtitle: `This is sample response ${reads} for component review.`,
        href: "/search?q=coffee",
      }],
    }));
  };
  window.fetch = fixtureFetch;
  return () => {
    if (window.fetch === fixtureFetch) window.fetch = originalFetch;
    for (const cancel of cancelPending) cancel();
  };
}

const meta = {
  title: "Radius UI/Find continuity",
  component: FindWorkshop,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component: "Find restores only the draft words. These clearly labeled sample responses show a fresh read, loading and failure. Provider data and stored result snapshots are not used.",
      },
    },
  },
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
} satisfies Meta<typeof FindWorkshop>;
export default meta;
type Story = StoryObj<typeof meta>;

export const NoSubmittedSearches: Story = {
  args: { initialQuery: "" },
  beforeEach: () => {
    const restoreFetch = sampleSearch("ready");
    const keys = ["fr:recent-search:v1", "fr:recent-search:v2"];
    const previous = keys.map((key) => window.localStorage.getItem(key));
    // This legacy fixture deliberately has no real submission provenance.
    window.localStorage.setItem(keys[0], JSON.stringify(["Sample legacy query"]));
    window.localStorage.removeItem(keys[1]);
    return () => {
      restoreFetch();
      keys.forEach((key, index) => {
        if (previous[index] === null) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, previous[index]!);
      });
    };
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Open sample Find" }));
    const dialog = within(await canvas.findByRole("dialog", { name: "What do you need?" }));
    const recents = within(dialog.getByRole("region", { name: "Recent searches on this device" }));
    await expect(recents.getByText("No recent searches on this device.")).toBeVisible();
    await expect(recents.queryByRole("button")).not.toBeInTheDocument();
    await expect(dialog.queryByText("Sample legacy query")).not.toBeInTheDocument();
    await userEvent.type(dialog.getByRole("searchbox"), "Sample typed draft");
    await userEvent.click(dialog.getByRole("button", { name: "Clear search" }));
    await expect(within(dialog.getByRole("region", { name: "Recent searches on this device" }))
      .getByText("No recent searches on this device.")).toBeVisible();
    await expect(window.localStorage.getItem("fr:recent-search:v2")).toBeNull();
  },
};

export const RestoredQuery: Story = {
  beforeEach: () => sampleSearch("ready"),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const opener = canvas.getByRole("button", { name: "Open sample Find" });
    await userEvent.click(opener);
    let dialog = within(await canvas.findByRole("dialog", { name: "What do you need?" }));
    await expect(dialog.getByRole("searchbox")).toHaveValue("coffee");
    await expect(await dialog.findByText("This is sample response 1 for component review.")).toBeVisible();
    await userEvent.click(dialog.getByRole("button", { name: "Close Find" }));
    await expect(canvas.queryByRole("dialog")).not.toBeInTheDocument();
    await expect(opener).toHaveFocus();
    await userEvent.click(opener);
    dialog = within(await canvas.findByRole("dialog", { name: "What do you need?" }));
    await expect(dialog.getByRole("searchbox")).toHaveValue("coffee");
    await expect(await dialog.findByText("This is sample response 2 for component review.")).toBeVisible();
    await expect(dialog.queryByText("This is sample response 1 for component review.")).not.toBeInTheDocument();
  },
};

export const LoadingRestoredQuery: Story = {
  beforeEach: () => sampleSearch("loading"),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Open sample Find" }));
    const dialog = within(await canvas.findByRole("dialog", { name: "What do you need?" }));
    await expect(dialog.getByRole("searchbox")).toHaveValue("coffee");
    await expect(dialog.getByText("Searching…", { exact: true })).toBeVisible();
  },
};

export const UnavailableRestoredQuery: Story = {
  beforeEach: () => sampleSearch("error"),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Open sample Find" }));
    const dialog = within(await canvas.findByRole("dialog", { name: "What do you need?" }));
    await expect(dialog.getByRole("searchbox")).toHaveValue("coffee");
    await expect(await dialog.findByText("Search is unavailable right now.")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Try again" })).toBeEnabled();
  },
};
