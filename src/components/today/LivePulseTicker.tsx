"use client";

import { motion } from "framer-motion";
import { Zap } from "lucide-react";
import { useEffect, useState } from "react";

export default function LivePulseTicker({
  messages,
}: {
  messages: string[];
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (messages.length === 0) return null;

  return (
    <div className="relative mx-auto mt-4 w-full max-w-[360px] overflow-hidden rounded-full border bg-[var(--app-bg-surface)]/60 px-4 py-2 shadow-sm backdrop-blur-md"
         style={{ borderColor: "color-mix(in srgb, var(--app-border) 60%, transparent)" }}>
      {/* Fade edges */}
      <div className="absolute inset-y-0 left-0 z-10 w-6 bg-gradient-to-r from-[var(--app-bg)] to-transparent pointer-events-none" />
      <div className="absolute inset-y-0 right-0 z-10 w-6 bg-gradient-to-l from-[var(--app-bg)] to-transparent pointer-events-none" />
      
      <div className="flex items-center gap-2">
        <Zap className="h-3 w-3 shrink-0 text-yellow-500" fill="currentColor" />
        
        <div className="relative flex flex-1 overflow-hidden whitespace-nowrap">
          {mounted ? (
            <motion.div
              className="flex items-center gap-8"
              animate={{ x: ["0%", "-50%"] }}
              transition={{
                duration: messages.length * 8, // scale duration with message count
                ease: "linear",
                repeat: Infinity,
              }}
            >
              <div className="flex items-center gap-8">
                {messages.map((msg, i) => (
                  <span key={i} className="text-[12px] font-semibold text-[var(--app-ink-2)]">
                    {msg}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-8">
                {messages.map((msg, i) => (
                  <span key={`dup-${i}`} className="text-[12px] font-semibold text-[var(--app-ink-2)]">
                    {msg}
                  </span>
                ))}
              </div>
            </motion.div>
          ) : (
            <div className="flex items-center gap-8 opacity-0">
              {messages.map((msg, i) => (
                <span key={i} className="text-[12px] font-semibold text-[var(--app-ink-2)]">
                  {msg}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
