import { Sparkles, CheckCircle2, Circle } from "lucide-react";
import { useState } from "react";
import confetti from "canvas-confetti";
import { motion } from "framer-motion";

const QUEST_ITEMS = [
  { id: "q1", label: "Eat a classic Funnel Cake" },
  { id: "q2", label: "Find the prized steer in Building 12" },
  { id: "q3", label: "Ride the Ferris Wheel at the Midway" },
  { id: "q4", label: "Watch the Demolition Derby" },
];

export default function FairQuest() {
  const [completed, setCompleted] = useState<Set<string>>(new Set());

  const toggleItem = (id: string, e: React.MouseEvent) => {
    setCompleted((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        // Small confetti pop for a single item
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        const x = (rect.left + rect.width / 2) / window.innerWidth;
        const y = (rect.top + rect.height / 2) / window.innerHeight;
        
        confetti({
          particleCount: 40,
          spread: 60,
          origin: { x, y },
          colors: ["#FBBF24", "#3B82F6", "#10B981"],
          disableForReducedMotion: true,
        });

        // Big celebration if 100% completed
        if (next.size === QUEST_ITEMS.length) {
          setTimeout(() => {
            confetti({
              particleCount: 150,
              spread: 100,
              origin: { y: 0.6 },
              colors: ["#FBBF24", "#F59E0B", "#D97706"],
              disableForReducedMotion: true,
            });
          }, 300);
        }
      }
      return next;
    });
  };

  const progress = Math.round((completed.size / QUEST_ITEMS.length) * 100);

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5, type: "spring", bounce: 0.3 }}
      data-fair-quest
      aria-label="Fair Quest Scavenger Hunt"
      className="mt-8 overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated-solid)] shadow-sm"
      style={{ borderColor: "color-mix(in srgb, var(--app-border-strong) 60%, transparent)" }}
    >
      <div className="border-b bg-[var(--app-brand-press)] p-4 text-[var(--app-on-brand)]">
        <h3 className="flex items-center gap-2 text-[18px] font-extrabold tracking-tight">
          <Sparkles className="h-5 w-5 text-yellow-300" /> Fair Quest 2026
        </h3>
        <p className="mt-1 text-[13px] font-medium text-[var(--app-on-brand)] opacity-90">
          Complete the ultimate fair experience!
        </p>
        <div className="mt-3 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/20">
            <div
              className="h-full bg-yellow-300 transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-[12px] font-bold">{progress}%</span>
        </div>
      </div>
      <div className="divide-y p-1" style={{ borderColor: "var(--app-border)" }}>
        {QUEST_ITEMS.map((item) => {
          const isDone = completed.has(item.id);
          return (
            <button
              key={item.id}
              onClick={(e) => toggleItem(item.id, e)}
              className="flex w-full items-center gap-3 p-3 text-left transition-colors active:bg-[var(--app-bg-hover)]"
            >
              {isDone ? (
                <CheckCircle2 className="h-6 w-6 shrink-0 text-[var(--app-brand-press)]" />
              ) : (
                <Circle className="h-6 w-6 shrink-0 text-[var(--app-ink-3)]" />
              )}
              <span
                className={`text-[15px] font-semibold ${isDone ? "text-[var(--app-ink-3)] line-through" : "text-[var(--app-ink)]"}`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </motion.section>
  );
}
