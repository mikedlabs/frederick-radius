import React from "react";
import Image from "next/image";
import { Clock, MapPin } from "lucide-react";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";

export type InTheStreetsTimelineCardProps = {
  title: string;
  time: string;
  location?: string;
  description: string;
  imageUrl: string;
  imageAlt: string;
};

export default function InTheStreetsTimelineCard({
  title,
  time,
  location,
  description,
  imageUrl,
  imageAlt,
}: InTheStreetsTimelineCardProps) {
  return (
    <div className="relative overflow-hidden rounded-[var(--app-radius-xl)] bg-black/5 active:scale-[0.98] transition-transform duration-[var(--app-dur-med)] ease-[var(--app-ease-spring)] shadow-md touch-manipulation cursor-pointer">
      {/* Background Image */}
      <div className="relative h-64 w-full">
        <Image
          src={imageUrl}
          alt={imageAlt}
          fill
          className="object-cover"
          placeholder="blur"
          blurDataURL={PAPER_CREAM_BLUR}
        />
        {/* Gradient overlay for text legibility */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
      </div>

      {/* Content overlay */}
      <div className="absolute bottom-0 left-0 right-0 p-5 backdrop-blur-md bg-black/20 text-white">
        <h3 className="font-serif text-2xl font-bold tracking-tight text-white mb-2 leading-tight">
          {title}
        </h3>
        
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2 text-sm font-medium text-white/90">
          <div className="flex items-center gap-1.5">
            <Clock className="w-4 h-4 opacity-75" strokeWidth={2.5} />
            {time}
          </div>
          {location && (
            <div className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4 opacity-75" strokeWidth={2.5} />
              {location}
            </div>
          )}
        </div>
        
        <p className="text-sm leading-relaxed text-white/80 line-clamp-2">
          {description}
        </p>
      </div>
    </div>
  );
}
