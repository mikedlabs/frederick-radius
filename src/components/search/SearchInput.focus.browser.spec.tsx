// @vitest-environment jsdom

import { act } from "react";
import Link from "next/link";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import SearchInput from "./SearchInput";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("./useNativeRequestReturn", () => ({ useNativeRequestReturn: vi.fn() }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
afterEach(() => {
  if (root) act(() => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
});

function start() {
  const page = <main><SearchInput /><Link href="/collections/kid-energy-burners">Out with kids</Link></main>;
  const rendered = document.createElement("div");
  document.body.append(rendered);
  rendered.innerHTML = renderToString(page);
  return { page, rendered };
}

it("preserves a visitor's focused guide when a cold Find page hydrates", () => {
  const { page, rendered } = start();
  const guide = rendered.querySelector("a")!;
  guide.focus();
  act(() => { root = hydrateRoot(rendered, page); });
  expect(document.activeElement).toBe(guide);
});

it("opens on the blank search field when focus is still on the document", () => {
  const { page, rendered } = start();
  act(() => { root = hydrateRoot(rendered, page); });
  expect(document.activeElement).toBe(rendered.querySelector("input[type=search]"));
});
