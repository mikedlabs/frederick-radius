"use client";

import React, { useState, useEffect } from "react";
import { Command } from "cmdk";
import { Search, MapPin, Calendar, ArrowRight, Building2, Tag, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

type SearchResult = {
  id: string;
  type: "place" | "event" | "category" | "municipality" | "action";
  title: string;
  href: string;
  subtitle?: string;
};

export default function CommandMenu() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [aiResult, setAiResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [isAiMode, setIsAiMode] = useState(false);
  const router = useRouter();

  // Listen for Cmd+K globally
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  // Handle Tab key to toggle AI mode
  useEffect(() => {
    const handleTab = (e: KeyboardEvent) => {
      if (open && e.key === "Tab") {
        e.preventDefault();
        setIsAiMode(prev => !prev);
      }
    };
    document.addEventListener("keydown", handleTab);
    return () => document.removeEventListener("keydown", handleTab);
  }, [open]);

  // Fetch from /api/search when query changes
  useEffect(() => {
    if (!query) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      setAiResult(null);
      return;
    }
    
    setLoading(true);
    const timeoutId = setTimeout(() => {
      if (isAiMode) {
        // Natural Language AI Search
        fetch(`/api/search/smart?q=${encodeURIComponent(query)}`)
          .then(res => res.json())
          .then(data => {
            setAiResult(data);
            setLoading(false);
          })
          .catch(() => setLoading(false));
      } else {
        // Standard Search
        fetch(`/api/search?q=${encodeURIComponent(query)}&limit=10`)
          .then(res => res.json())
          .then(data => {
            if (data.results) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              setResults(data.results.map((r: any) => ({
                id: r.id || r.slug,
                type: r.type,
                title: r.title || r.name,
                href: r.href,
                subtitle: r.subtitle || r.address
              })));
            }
            setLoading(false);
          })
          .catch(() => setLoading(false));
      }
    }, isAiMode ? 600 : 150); // longer debounce for AI
    
    return () => clearTimeout(timeoutId);
  }, [query, isAiMode]);

  const handleSelect = (href: string) => {
    setOpen(false);
    if (href.startsWith("http")) {
      window.open(href, "_blank", "noopener,noreferrer");
    } else {
      router.push(href);
    }
  };

  const getIcon = (type: string) => {
    switch(type) {
      case "place": return <MapPin className="w-4 h-4 text-brand" />;
      case "event": return <Calendar className="w-4 h-4 text-accent" />;
      case "category": return <Tag className="w-4 h-4 text-cool" />;
      case "municipality": return <Building2 className="w-4 h-4 text-positive" />;
      case "action": return <ArrowRight className="w-4 h-4 text-cool" />;
      default: return <Search className="w-4 h-4 text-ink-3" />;
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]">
          {/* Backdrop */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
          />
          
          {/* Command Palette */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="relative z-10 w-[90vw] max-w-2xl overflow-hidden rounded-2xl bg-white/85 dark:bg-zinc-900/85 backdrop-blur-2xl shadow-2xl border border-white/20 dark:border-white/10"
            style={{ boxShadow: "0 20px 40px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.2)" }}
          >
            <Command 
              shouldFilter={false} // We rely on our API's backend ranking
              className="flex flex-col w-full text-[var(--app-ink)]"
            >
              {/* Header / Mode Switcher */}
              <div className="flex items-center justify-between border-b px-4 py-2 bg-[var(--app-bg-elevated)]" style={{ borderColor: "var(--app-border)" }}>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setIsAiMode(false)}
                    className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors ${!isAiMode ? "bg-[var(--app-ink)] text-white" : "text-[var(--app-ink-2)] hover:bg-[var(--app-bg-sunken)]"}`}
                  >
                    Quick Search
                  </button>
                  <button 
                    onClick={() => setIsAiMode(true)}
                    className={`px-3 py-1 text-xs font-semibold rounded-full flex items-center gap-1 transition-colors ${isAiMode ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" : "text-[var(--app-ink-2)] hover:bg-[var(--app-bg-sunken)]"}`}
                  >
                    <Sparkles className="w-3 h-3" />
                    Ask AI
                  </button>
                </div>
                <div className="text-[10px] text-[var(--app-ink-3)] font-mono hidden sm:block">
                  Press <kbd className="border rounded px-1 py-0.5 mx-0.5">Tab</kbd> to switch
                </div>
              </div>

              <div className="flex items-center border-b px-4 py-1" style={{ borderColor: "var(--app-border)" }}>
                {isAiMode ? (
                  <Sparkles className="w-5 h-5 text-purple-500 shrink-0 mr-2" />
                ) : (
                  <Search className="w-5 h-5 opacity-50 shrink-0 mr-2" />
                )}
                <Command.Input 
                  value={query}
                  onValueChange={setQuery}
                  placeholder={isAiMode ? "Ask anything (e.g., 'free live music tonight')" : "Ask or find a place, event, or service..."}
                  className="flex-1 h-14 bg-transparent outline-none text-[16px] placeholder:text-[var(--app-ink-3)] font-medium"
                  autoFocus
                />
                <kbd className="hidden sm:inline-flex items-center gap-1 rounded bg-[var(--app-bg-sunken)] px-1.5 font-mono text-[10px] font-medium text-[var(--app-ink-3)] border" style={{ borderColor: "var(--app-border)" }}>
                  ESC
                </kbd>
              </div>

              <Command.List className="max-h-[340px] overflow-y-auto p-2">
                {query.length > 0 && results.length === 0 && !loading && (
                  <Command.Empty className="py-10 text-center text-[var(--app-ink-3)] text-sm">
                    No results found for &quot;{query}&quot;.
                  </Command.Empty>
                )}
                
                {loading && results.length === 0 && !aiResult && (
                  <div className="py-10 text-center text-[var(--app-ink-3)] text-sm animate-pulse">
                    {isAiMode ? "Thinking..." : "Searching Frederick County..."}
                  </div>
                )}
                
                {isAiMode && aiResult && !loading && (
                  <Command.Group heading="AI Suggestion" className="text-[10px] font-bold uppercase tracking-wider text-[var(--app-ink-3)] px-2 py-2">
                    <Command.Item
                      onSelect={() => handleSelect(aiResult.suggestedPath)}
                      className="flex flex-col gap-1 px-3 py-3 mt-1 rounded-xl cursor-pointer aria-selected:bg-purple-50 aria-selected:dark:bg-purple-900/20 aria-selected:shadow-sm aria-selected:border aria-selected:border-purple-200 transition-all border border-transparent outline-none"
                    >
                      <span className="font-semibold text-[14px] text-purple-700 dark:text-purple-300">
                        {aiResult.explanation}
                      </span>
                      <span className="text-[12px] text-[var(--app-ink-2)] flex items-center gap-1">
                        View results <ArrowRight className="w-3 h-3" />
                      </span>
                    </Command.Item>
                  </Command.Group>
                )}

                {!isAiMode && results.length > 0 && (
                  <Command.Group heading="Best Matches" className="text-[10px] font-bold uppercase tracking-wider text-[var(--app-ink-3)] px-2 py-2">
                    {results.map((result) => (
                      <Command.Item
                        key={result.id}
                        onSelect={() => handleSelect(result.href)}
                        className="flex items-center gap-3 px-3 py-2.5 mt-1 rounded-xl cursor-pointer aria-selected:bg-[var(--app-bg-elevated-solid)] aria-selected:shadow-sm aria-selected:border aria-selected:border-[var(--app-border-strong)] transition-all border border-transparent outline-none"
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--app-bg-sunken)]">
                          {getIcon(result.type)}
                        </div>
                        <div className="flex flex-col flex-1 min-w-0">
                          <span className="font-semibold text-[14px] truncate">{result.title}</span>
                          {result.subtitle && (
                            <span className="text-[12px] text-[var(--app-ink-2)] truncate">{result.subtitle}</span>
                          )}
                        </div>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}
              </Command.List>
            </Command>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
