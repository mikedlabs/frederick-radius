// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DataBackup from "./DataBackup";
import { BACKUP_FORMAT } from "./data-backup";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement;
let root: Root;
beforeEach(async () => {
  localStorage.clear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<DataBackup />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function button(label: string) {
  const match = Array.from(host.querySelectorAll("button")).find((item) => item.textContent === label);
  if (!match) throw new Error(`Button missing: ${label}`);
  return match;
}
async function click(label: string) {
  await act(async () => button(label).click());
}
async function select(data: unknown) {
  const input = host.querySelector('input[type="file"]')!;
  Object.defineProperty(input, "files", { configurable: true, value: [{ name: "radius-backup.json", text: async () => JSON.stringify(data) }] });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
}

const backup = {
  format: BACKUP_FORMAT,
  data: { "fr:first": "restored", "fr.second": "new", "fr-third": "same", unrelated: "ignored", "fr:invalid": 3 },
};
function seed() {
  localStorage.setItem("fr:first", "original");
  localStorage.setItem("fr-third", "same");
  localStorage.setItem("unrelated", "original");
}
describe("device backup restore", () => {
  it("reviews counts, focuses the summary and lets visitors cancel without writes", async () => {
    seed();
    await click("Restore from file");
    await select(backup);
    expect(document.activeElement?.textContent).toBe("Review your backup");
    expect(Array.from(host.querySelectorAll("dd"), (item) => item.textContent)).toEqual(["1", "1", "1"]);
    expect(localStorage.getItem("fr:first")).toBe("original");
    expect(localStorage.getItem("fr.second")).toBeNull();
    await click("Cancel");
    expect(host.querySelector("h3")).toBeNull();
    expect(document.activeElement).toBe(button("Restore from file"));
    expect(localStorage.getItem("fr:first")).toBe("original");
    expect(localStorage.getItem("fr.second")).toBeNull();
  });

  it("reads a versionless legacy file and merges only qualifying entries after confirmation", async () => {
    vi.useFakeTimers();
    seed();
    await select(backup);
    await click("Confirm restore");
    expect(localStorage.getItem("fr:first")).toBe("restored");
    expect(localStorage.getItem("fr.second")).toBe("new");
    expect(localStorage.getItem("fr-third")).toBe("same");
    expect(localStorage.getItem("unrelated")).toBe("original");
    expect(localStorage.getItem("fr:invalid")).toBeNull();
    expect(host.querySelector('[role="status"]')?.textContent).toContain("Your backup is restored");
  });

  it("asks for a new confirmation when another tab changes the reviewed entries", async () => {
    seed();
    await select(backup);
    localStorage.setItem("fr:first", "restored");
    await click("Confirm restore");
    expect(host.querySelector('[role="status"]')?.textContent).toContain("updated counts");
    expect(Array.from(host.querySelectorAll("dd"), (item) => item.textContent)).toEqual(["1", "0", "2"]);
    expect(localStorage.getItem("fr.second")).toBeNull();
  });

  it("undoes new and overwritten entries if the browser rejects a later write", async () => {
    seed();
    await select({ format: BACKUP_FORMAT, version: 1, data: { "fr.new": "added", "fr:first": "restored", "fr:full": "large" } });
    const set = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function(this: Storage, key, value) {
      if (key === "fr:full") throw new DOMException("Full", "QuotaExceededError");
      set.call(this, key, value);
    });
    await click("Confirm restore");
    expect(localStorage.getItem("fr.new")).toBeNull();
    expect(localStorage.getItem("fr:first")).toBe("original");
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("free up space");
    expect(button("Confirm restore")).toBeTruthy();
  });

  it("explains a blocked rollback and asks for the file again", async () => {
    seed();
    await select({ format: BACKUP_FORMAT, data: { "fr:first": "restored", "fr:full": "large" } });
    const set = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function(this: Storage, key, value) {
      if (key === "fr:full" || value === "original") throw new Error("Storage blocked");
      set.call(this, key, value);
    });
    await click("Confirm restore");
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("could not undo every change");
    expect(host.querySelector("h3")).toBeNull();
  });

  it("distinguishes unsupported files from blocked device storage before writing", async () => {
    await select({ format: BACKUP_FORMAT, version: 99, data: backup.data });
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("JSON file");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Blocked"); });
    await select(backup);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("blocked access to device storage");
    expect(host.querySelector("h3")).toBeNull();
  });
});
