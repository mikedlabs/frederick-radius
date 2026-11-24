// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import SubmissionReceiptHeading from "./SubmissionReceiptHeading";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("moves focus from the removed form to its receipt once", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<button>Send</button>));
    host.querySelector("button")!.focus();
    const receipt = () => (
      <>
        <SubmissionReceiptHeading className="">Received</SubmissionReceiptHeading>
        <button>Browse again</button>
      </>
    );
    await act(async () => root.render(receipt()));
    expect(document.activeElement).toBe(host.querySelector("h2"));
    host.querySelector("button")!.focus();
    await act(async () => root.render(receipt()));
    expect(document.activeElement).toBe(host.querySelector("button"));
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
