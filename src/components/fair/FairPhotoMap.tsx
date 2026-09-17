"use client";

import { useState } from "react";
import Image from "next/image";
import { MapPin, Music, Utensils, Ticket, Star } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export type PhotoMarker = {
  id: string;
  xPercent: number;
  yPercent: number;
  label: string;
  subtitle?: string;
  icon?: "pin" | "music" | "food" | "ticket" | "star";
  events?: { time: string; title: string }[];
};

interface FairPhotoMapProps {
  imageUrl: string;
  altText: string;
  markers: PhotoMarker[];
  onMarkerClick?: (id: string) => void;
}

export function FairPhotoMap({ imageUrl, altText, markers, onMarkerClick }: FairPhotoMapProps) {
  const [activeMarker, setActiveMarker] = useState<string | null>(null);

  const getIcon = (type?: string) => {
    switch (type) {
      case "music": return <Music className="h-4 w-4" strokeWidth={2.5} />;
      case "food": return <Utensils className="h-4 w-4" strokeWidth={2.5} />;
      case "ticket": return <Ticket className="h-4 w-4" strokeWidth={2.5} />;
      case "star": return <Star className="h-4 w-4" strokeWidth={2.5} />;
      default: return <MapPin className="h-4 w-4" strokeWidth={2.5} />;
    }
  };

  const handleMarkerClick = (id: string) => {
    setActiveMarker(activeMarker === id ? null : id);
    if (onMarkerClick) {
      onMarkerClick(id);
    }
  };

  return (
    <div className="relative w-full overflow-hidden rounded-2xl bg-[var(--app-ink)] shadow-md">
      <div className="relative w-full" style={{ paddingBottom: "75%" /* 4:3 aspect ratio */ }}>
        <Image
          src={imageUrl}
          alt={altText}
          fill
          className="object-cover"
        />
        {markers.map((marker, index) => {
          const isActive = activeMarker === marker.id;
          return (
            <motion.div
              key={marker.id}
              initial={{ scale: 0, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{
                type: "spring",
                stiffness: 300,
                damping: 20,
                delay: index * 0.05,
              }}
              className={`absolute -translate-x-1/2 -translate-y-1/2 ${isActive ? "z-20" : "z-10"}`}
              style={{ left: `${marker.xPercent}%`, top: `${marker.yPercent}%` }}
            >
              <div className="relative">
                {isActive && (
                  <motion.div
                    layoutId="activeMarkerRing"
                    className="absolute -inset-2 rounded-full border-2 border-[var(--app-brand)]/50 bg-[var(--app-brand)]/10"
                    animate={{ scale: [1, 1.25, 1], opacity: [0.6, 0, 0.6] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  />
                )}
                
                <button
                  type="button"
                  onClick={() => handleMarkerClick(marker.id)}
                  className={`relative flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all duration-300 hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
                    isActive
                      ? "border-[var(--app-brand)] bg-[var(--app-brand)] text-white scale-110 shadow-[0_4px_12px_rgba(0,0,0,0.15)]"
                      : "border-white bg-white/95 text-[var(--app-ink)] shadow-sm hover:bg-white hover:shadow-md hover:text-[var(--app-brand)]"
                  }`}
                  aria-label={marker.label}
                  aria-expanded={isActive}
                >
                  {getIcon(marker.icon)}
                </button>
              </div>
              
              <AnimatePresence>
                {isActive && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.96 }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    className="absolute left-1/2 top-full mt-3 w-max min-w-[12rem] max-w-[16rem] -translate-x-1/2 rounded-2xl bg-white/90 p-3.5 shadow-[0_8px_30px_rgb(0,0,0,0.12)] ring-1 ring-black/5 backdrop-blur-xl supports-[backdrop-filter]:bg-white/70"
                  >
                    <p className="font-bold text-[var(--app-ink)] text-[15px] leading-tight">
                      {marker.label}
                    </p>
                    {marker.subtitle && (
                      <p className="mt-1.5 text-xs text-[var(--app-ink)]/75 leading-relaxed">
                        {marker.subtitle}
                      </p>
                    )}
                    
                    {marker.events && marker.events.length > 0 && (
                      <div className="mt-3 flex flex-col gap-2 border-t border-black/[0.06] pt-3">
                        {marker.events.map((event, i) => (
                          <div key={i} className="flex items-start gap-2.5">
                            <span className="mt-[2px] inline-flex rounded-sm bg-[var(--app-brand)]/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--app-brand)]">
                              {event.time}
                            </span>
                            <span className="text-xs font-medium text-[var(--app-ink)]/90 leading-snug">
                              {event.title}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {/* Triangle pointer */}
                    <div 
                      className="absolute -top-[5px] left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-l border-t border-black/5 bg-white/90 backdrop-blur-xl supports-[backdrop-filter]:bg-white/70" 
                      style={{ clipPath: "polygon(0 0, 100% 0, 0 100%)" }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
