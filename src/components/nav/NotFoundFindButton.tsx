"use client";

import type { MouseEvent } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { requestFind } from "@/lib/findBridge";

/** The single Find overlay lives in the app header; a 404 can render without it. */
export function appFindIsMounted(doc: Pick<Document, "querySelector">): boolean {
  return doc.querySelector("[data-app-topbar]") !== null;
}

/**
 * The 404's one primary action. Inside the app shell it opens the same Find
 * overlay as the header, so a lost visitor never meets a second search
 * implementation and nothing grabs focus or raises a keyboard on arrival.
 * Without the shell (or with a modified click) it is an ordinary link to the
 * search page.
 */
export default function NotFoundFindButton() {
  const openFind = (event: MouseEvent<HTMLAnchorElement>) => {
    const modified = event.button !== 0
      || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
    if (modified) return;
    if (!appFindIsMounted(document)) return;
    event.preventDefault();
    requestFind("global");
  };

  return (
    <Button
      href="/search"
      size="lg"
      onClick={openFind}
      iconLeft={<Search className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />}
    >
      Search Frederick Radius
    </Button>
  );
}
