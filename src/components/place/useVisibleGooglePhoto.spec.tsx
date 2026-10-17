// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useVisibleGooglePhoto } from "./useVisibleGooglePhoto";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const src = "/api/place-photo?slug=actual-place&name=places%2Factual-place%2Fphotos%2Fprimary&w=360&fallback=signal";
const photo = () => new Response(new Blob(["photo-bytes"], { type: "image/jpeg" }), { headers: { "Content-Type": "image/jpeg" } });
function Probe({ source = src, enabled = true }: { source?: string; enabled?: boolean }) {
  const { frameRef, bytes } = useVisibleGooglePhoto(source, enabled);
  return <span ref={frameRef} data-status={bytes.status}
    data-src={bytes.status === "ready" ? bytes.objectUrl : undefined}
    data-reason={bytes.status === "fallback" ? bytes.reason : undefined} />;
}

describe("visible photo display lifecycle", () => {
  let root: Root;
  let container: HTMLDivElement;
  let enter: Array<() => void>;
  let create: ReturnType<typeof vi.fn<(obj: Blob | MediaSource) => string>>;
  let revoke: ReturnType<typeof vi.fn<(url: string) => void>>;
  beforeEach(() => {
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    enter = [];
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: IntersectionObserverCallback) {
        enter.push(() => callback([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver));
      }
      observe() {} disconnect() {}
    });
    create = vi.fn<(obj: Blob | MediaSource) => string>().mockImplementation(() => `blob:owned-display-${create.mock.calls.length}`);
    revoke = vi.fn<(url: string) => void>();
    vi.stubGlobal("URL", class extends URL { static createObjectURL = create; static revokeObjectURL = revoke; });
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("sends no offscreen request, uses one visible response, and revokes its display URL on unmount", async () => {
    const fetcher = vi.fn(async () => photo()); vi.stubGlobal("fetch", fetcher);
    await act(async () => root.render(<Probe />));
    expect(fetcher).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    await act(async () => enter[0]());
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(container.firstElementChild?.getAttribute("data-status")).toBe("ready");
    expect(container.firstElementChild?.getAttribute("data-src")).toBe("blob:owned-display-1");
    expect(revoke).not.toHaveBeenCalled();
    await act(async () => root.render(null));
    expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:owned-display-1");
  });

  it("revokes only the old source when a mounted frame is recycled", async () => {
    const fetcher = vi.fn(async () => photo()); vi.stubGlobal("fetch", fetcher);
    await act(async () => root.render(<Probe />));
    await act(async () => enter[0]());
    const next = src.replace("primary", "different");
    await act(async () => root.render(<Probe source={next} />));
    expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:owned-display-1");
    expect(container.firstElementChild?.getAttribute("data-status")).toBe("idle");
    expect(container.firstElementChild?.getAttribute("data-src")).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
    await act(async () => enter[1]());
    expect(container.firstElementChild?.getAttribute("data-src")).toBe("blob:owned-display-2");
    await act(async () => root.render(null));
    expect(revoke.mock.calls.map(([url]) => url)).toEqual(["blob:owned-display-1", "blob:owned-display-2"]);
  });

  it("does not allocate or paint a delayed response after its source was replaced", async () => {
    let finish!: (response: Response) => void;
    const fetcher = vi.fn().mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; })).mockResolvedValueOnce(photo());
    vi.stubGlobal("fetch", fetcher);
    await act(async () => root.render(<Probe />));
    await act(async () => enter[0]());
    const next = src.replace("primary", "next");
    await act(async () => root.render(<Probe source={next} />));
    await act(async () => finish(photo()));
    expect(create).not.toHaveBeenCalled();
    expect(container.firstElementChild?.getAttribute("data-src")).toBeNull();
    await act(async () => enter[1]());
    expect(container.firstElementChild?.getAttribute("data-src")).toBe("blob:owned-display-1");
  });

  it("does not allocate a display URL for a daily-cap signal", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("signal", { headers: { "Content-Type": "image/png", "X-Photo-Fallback": "daily-cap" } })));
    await act(async () => root.render(<Probe />));
    await act(async () => enter[0]());
    expect(container.firstElementChild?.getAttribute("data-status")).toBe("fallback");
    expect(container.firstElementChild?.getAttribute("data-reason")).toBe("daily-cap");
    expect(create).not.toHaveBeenCalled();
  });

  it("gives concurrent live consumers separate URLs and releases each without breaking the other", async () => {
    let finish!: (response: Response) => void;
    const fetcher = vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; })); vi.stubGlobal("fetch", fetcher);
    await act(async () => root.render(<><Probe key="a" /><Probe key="b" /></>));
    await act(async () => { enter[0](); enter[1](); });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await act(async () => finish(photo()));
    expect(create).toHaveBeenCalledTimes(2);
    await act(async () => root.render(<Probe key="b" />));
    expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:owned-display-1");
    expect(container.firstElementChild?.getAttribute("data-src")).toBe("blob:owned-display-2");
  });
  it("never resurrects a revoked URL when returning to an earlier source or enabling it again", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => photo()));
    await act(async () => root.render(<Probe />));
    await act(async () => enter[0]());
    await act(async () => root.render(<Probe source={src.replace("primary", "different")} />));
    await act(async () => root.render(<Probe />));
    expect(container.firstElementChild?.getAttribute("data-status")).toBe("idle");
    expect(container.firstElementChild?.getAttribute("data-src")).toBeNull();
    await act(async () => enter.at(-1)!());
    expect(container.firstElementChild?.getAttribute("data-src")).toBe("blob:owned-display-2");
    await act(async () => root.render(<Probe enabled={false} />));
    await act(async () => root.render(<Probe />));
    expect(container.firstElementChild?.getAttribute("data-status")).toBe("idle");
    expect(container.firstElementChild?.getAttribute("data-src")).toBeNull();
    expect(revoke.mock.calls.map(([url]) => url)).toEqual(["blob:owned-display-1", "blob:owned-display-2"]);
  });

});
