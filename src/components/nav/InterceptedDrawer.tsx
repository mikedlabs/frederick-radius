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

  return (
    <BottomDrawer
      open={true}
      onOpenChange={handleOpenChange}
      title={title}
      subtitle={subtitle}
      bareHeader={bareHeader}
    >
      {children}
    </BottomDrawer>
  );
}
