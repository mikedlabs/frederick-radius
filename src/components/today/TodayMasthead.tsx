"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import Image from "next/image";
import TodayScopeStatus from "@/components/today/TodayScopeStatus";

type TodayMastheadProps = {
  title: string;
  dateline: string;
};

export default function TodayMasthead({ title, dateline }: TodayMastheadProps) {
  const { scrollY } = useScroll();

  // Subtle parallax effect on the image
  const imageY = useTransform(scrollY, [0, 200], [0, 40]);
  
  // Fade out and scale down the masthead slightly when scrolling down
  const opacity = useTransform(scrollY, [0, 300], [1, 0.5]);
  const scale = useTransform(scrollY, [0, 300], [1, 0.95]);

  return (
    <motion.header
      style={{ opacity, scale }}
      className="today-arrival today-arrival--masthead relative mb-5 flex flex-col overflow-hidden rounded-[var(--app-radius-lg)] border border-[var(--app-border)] bg-[var(--app-bg-elevated-solid)] sm:grid sm:grid-cols-[minmax(0,1fr)_42%] origin-top"
    >
      <div className="min-w-0 p-4 sm:p-6 z-10 bg-[var(--app-bg-elevated-solid)]">
        <h1 className="font-serif text-[30px] font-semibold leading-[1.05] tracking-tight sm:text-[32px]" style={{ color: "var(--app-ink)" }}>
          {title}
        </h1>
        <TodayScopeStatus dateline={dateline} />
      </div>
      
      <div className="relative order-first h-[140px] sm:order-none sm:h-full sm:min-h-[180px] overflow-hidden">
        <motion.div style={{ y: imageY }} className="absolute inset-0">
          <Image 
            src="/images/seasons/summer/SUMMER CARROL CREEK.jpg" 
            fill 
            sizes="(min-width: 1024px) 440px, 100vw" 
            alt="Carroll Creek in Frederick, photographed by Mike D." 
            className="object-cover object-center" 
          />
        </motion.div>
        <figcaption className="absolute bottom-2 right-2 z-10 rounded-sm bg-[var(--app-ink)] px-2 py-1 text-[10px] leading-snug text-[var(--app-on-brand)]">
          Carroll Creek · Mike D
        </figcaption>
      </div>
    </motion.header>
  );
}
