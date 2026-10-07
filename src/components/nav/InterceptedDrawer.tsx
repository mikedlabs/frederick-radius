"use client";

import { useRouter } from "next/navigation";
import { type ReactNode } from "react";
import BottomDrawer from "@/components/ui/BottomDrawer";

export default function InterceptedDrawer({
  children,
  title,
  subtitle,
  bareHeader,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
  bareHeader?: boolean;
}) {
  const router = useRouter();

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      router.back();
    }
  };

  // Route drawers open over a whole page of text (Today's alerts sit right
  // behind "What do you need?"), so the default 85% surface let that copy
  // read through. Text-bearing sheets take the opaque surface.
  return (
    <BottomDrawer
      open={true}
      onOpenChange={handleOpenChange}
      title={title}
      subtitle={subtitle}
      bareHeader={bareHeader}
      surface="solid"
    >
      {children}
    </BottomDrawer>
  );
}
