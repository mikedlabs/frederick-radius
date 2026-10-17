"use client";

import { useRouter } from "next/navigation";
import { type ReactNode } from "react";
import BottomDrawer from "@/components/ui/BottomDrawer";

export default function InterceptedDrawer({
  children,
  title,
  subtitle,
  bareHeader,
  inlineToolsPanels = false,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
  bareHeader?: boolean;
  inlineToolsPanels?: boolean;
}) {
  const router = useRouter();

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      router.back();
    }
  };

  return (
    <BottomDrawer
      open={true}
      onOpenChange={handleOpenChange}
      title={title}
      subtitle={subtitle}
      bareHeader={bareHeader}
      onEscapeKeyDown={inlineToolsPanels ? (event) => {
        // Radix checks Escape at document capture, before the child boundary.
        // Keep this outer drawer open while its inline Tools panel handles it.
        if (event.target instanceof Element && event.target.closest("[data-tool-deck-inline]")) event.preventDefault();
      } : undefined}
    >
      {children}
    </BottomDrawer>
  );
}
