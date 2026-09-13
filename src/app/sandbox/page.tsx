"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, useMotionValue, useTransform, useScroll, AnimatePresence, useSpring } from "framer-motion";
import { Command } from "cmdk";
import { Drawer } from "vaul";
import { Search, Map, Calendar, Bus, SearchIcon, Ticket, ArrowLeft, ArrowRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

// -----------------------------------------------------------------------------
// 1. Dynamic Island Alert
// -----------------------------------------------------------------------------
function DynamicIsland() {
  const [expanded, setExpanded] = useState(false);
  return (
    <motion.div
      layout
      onClick={() => setExpanded(!expanded)}
      className="bg-black/90 text-white rounded-full mx-auto shadow-2xl cursor-pointer flex flex-col justify-center overflow-hidden"
      style={{ borderRadius: expanded ? 32 : 999 }}
      initial={false}
      animate={{
        width: expanded ? 340 : 120,
        height: expanded ? 100 : 40,
      }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
    >
      <motion.div layout className="flex items-center px-4 w-full h-full">
        <motion.div layout className="flex items-center justify-between w-full">
          <div className="flex items-center gap-3">
            <motion.div layout className="bg-red-500 rounded-full p-1.5 text-white">
              <Bus size={14} />
            </motion.div>
            <AnimatePresence>
              {expanded && (
                <motion.div
                  initial={{ opacity: 0, filter: "blur(4px)" }}
                  animate={{ opacity: 1, filter: "blur(0px)" }}
                  exit={{ opacity: 0, filter: "blur(4px)" }}
                  className="flex flex-col"
                >
                  <span className="text-sm font-semibold text-white leading-tight">Bus 40 is arriving</span>
                  <span className="text-xs text-white/70 leading-tight">East Street • 2 mins</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <AnimatePresence>
            {!expanded && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2"
              >
                <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                <span className="text-xs font-semibold">Alert</span>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

// -----------------------------------------------------------------------------
// 2. Global Command Menu (cmdk)
// -----------------------------------------------------------------------------
function CommandMenuSandbox() {
  const [open, setOpen] = useState(false);
  
  return (
    <div>
      <button 
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/50 dark:bg-black/50 backdrop-blur-md border border-white/20 shadow-sm text-sm font-medium hover:bg-white/60 transition-colors w-full"
      >
        <Search size={16} className="text-zinc-500" />
        <span className="text-zinc-500 flex-1 text-left">Search everything...</span>
        <kbd className="hidden sm:inline-flex items-center gap-1 rounded bg-zinc-200/50 px-1.5 font-mono text-[10px] font-medium text-zinc-500">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>

      {/* Usually this goes in a Dialog, but we'll simulate the dialog for the sandbox */}
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] sm:pt-[25vh]">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm" 
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className="relative z-50 w-[90vw] max-w-[450px] overflow-hidden rounded-2xl bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl shadow-2xl border border-white/20 dark:border-white/10"
            >
              <Command className="flex flex-col w-full h-full text-zinc-900 dark:text-zinc-100">
                <div className="flex items-center border-b border-zinc-200 dark:border-zinc-800 px-3" cmdk-input-wrapper="">
                  <SearchIcon className="w-5 h-5 text-zinc-500 shrink-0" />
                  <Command.Input 
                    autoFocus
                    placeholder="Search transit, food, events..." 
                    className="flex h-12 w-full rounded-md bg-transparent py-3 px-3 text-sm outline-none placeholder:text-zinc-500 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
                <Command.List className="max-h-[300px] overflow-y-auto overflow-x-hidden p-2">
                  <Command.Empty className="py-6 text-center text-sm text-zinc-500">No results found.</Command.Empty>
                  <Command.Group heading="Transit" className="text-xs font-medium text-zinc-500 px-2 py-1.5">
                    <Command.Item className="flex items-center gap-2 px-2 py-2 text-sm rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer">
                      <div className="w-6 h-6 rounded bg-red-100 dark:bg-red-900/30 text-red-600 flex items-center justify-center"><Bus size={14}/></div>
                      Bus Route 40
                    </Command.Item>
                    <Command.Item className="flex items-center gap-2 px-2 py-2 text-sm rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer">
                      <div className="w-6 h-6 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center"><Bus size={14}/></div>
                      Bus Route 51
                    </Command.Item>
                  </Command.Group>
                  <Command.Group heading="Fairgrounds" className="text-xs font-medium text-zinc-500 px-2 py-1.5 mt-2">
                    <Command.Item className="flex items-center gap-2 px-2 py-2 text-sm rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer">
                      <div className="w-6 h-6 rounded bg-orange-100 dark:bg-orange-900/30 text-orange-600 flex items-center justify-center"><Map size={14}/></div>
                      Funnel Cake Stand
                    </Command.Item>
                    <Command.Item className="flex items-center gap-2 px-2 py-2 text-sm rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer">
                      <div className="w-6 h-6 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-600 flex items-center justify-center"><Calendar size={14}/></div>
                      Grandstand Events
                    </Command.Item>
                  </Command.Group>
                </Command.List>
              </Command>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// -----------------------------------------------------------------------------
// 3. True iOS Bottom Sheet (vaul)
// -----------------------------------------------------------------------------
function BottomSheetSandbox() {
  return (
    <Drawer.Root shouldScaleBackground>
      <Drawer.Trigger asChild>
        <button className="w-full bg-zinc-900 text-white dark:bg-white dark:text-black py-3 rounded-xl font-bold shadow-sm active:scale-[0.98] transition-transform">
          Open iOS Drawer
        </button>
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40 z-[100] backdrop-blur-sm" />
        <Drawer.Content className="bg-zinc-100 dark:bg-zinc-900 flex flex-col rounded-t-[32px] h-[70vh] mt-24 fixed bottom-0 left-0 right-0 z-[100] outline-none">
          <div className="p-4 bg-white dark:bg-zinc-800 rounded-t-[32px] flex-1 overflow-y-auto">
            <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-zinc-300 dark:bg-zinc-600 mb-8" />
            <div className="max-w-md mx-auto">
              <Drawer.Title className="font-bold text-2xl mb-4">Transit Stop Details</Drawer.Title>
              <Drawer.Description className="text-zinc-500 mb-6">
                This drawer perfectly mimics iOS native physics, rubber-banding, and background scaling. Try dragging it down.
              </Drawer.Description>
              
              <div className="space-y-4">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="bg-zinc-50 dark:bg-zinc-900 p-4 rounded-2xl flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600">
                      <Bus size={20} />
                    </div>
                    <div>
                      <div className="font-bold">Bus {40 + i}</div>
                      <div className="text-sm text-zinc-500">Arriving in {i * 3} mins</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

// -----------------------------------------------------------------------------
// 4. Holographic Tilt Wallet Cards
// -----------------------------------------------------------------------------
function TiltCard() {
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const mouseXSpring = useSpring(x);
  const mouseYSpring = useSpring(y);

  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ["17.5deg", "-17.5deg"]);
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ["-17.5deg", "17.5deg"]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const xPct = mouseX / width - 0.5;
    const yPct = mouseY / height - 0.5;
    x.set(xPct);
    y.set(yPct);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        rotateY,
        rotateX,
        transformStyle: "preserve-3d",
      }}
      className="relative h-48 w-full rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-2xl p-6 text-white cursor-pointer"
    >
      <div style={{ transform: "translateZ(50px)" }} className="h-full flex flex-col justify-between pointer-events-none">
        <div className="flex justify-between items-start">
          <div>
            <div className="text-xs font-medium opacity-80 uppercase tracking-wider">Frederick Fair</div>
            <div className="text-xl font-bold mt-1">Admission Ticket</div>
          </div>
          <Ticket size={24} className="opacity-80" />
        </div>
        <div>
          <div className="font-mono text-lg tracking-widest opacity-90">1x ADULT</div>
          <div className="text-xs opacity-60 mt-1">Valid Sep 15, 2026</div>
        </div>
      </div>
      
      {/* Holographic glare overlay */}
      <motion.div 
        className="absolute inset-0 rounded-2xl pointer-events-none opacity-50 mix-blend-overlay"
        style={{
          background: useTransform(
            () => `radial-gradient(farthest-corner at ${x.get() * 100 + 50}% ${y.get() * 100 + 50}%, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0) 80%)`
          )
        }}
      />
    </motion.div>
  );
}

// -----------------------------------------------------------------------------
// 5. Scoreboard Number Ticker
// -----------------------------------------------------------------------------
function NumberTicker({ value }: { value: number }) {
  // A simple implementation of a vertical sliding number
  return (
    <div className="h-[1.2em] overflow-hidden relative leading-none">
      <AnimatePresence mode="popLayout">
        <motion.span
          key={value}
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: "0%", opacity: 1 }}
          exit={{ y: "-100%", opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="block absolute inset-0"
        >
          {value}
        </motion.span>
      </AnimatePresence>
      <span className="invisible">{value}</span> {/* placeholder for width */}
    </div>
  );
}

function TickerDemo() {
  const [count, setCount] = useState(42);
  useEffect(() => {
    const interval = setInterval(() => setCount(c => c > 0 ? c - 1 : 42), 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center justify-center p-6 bg-zinc-900 rounded-2xl text-white shadow-inner font-mono text-4xl font-bold">
      <div className="flex items-baseline gap-2">
        <NumberTicker value={Math.floor(count / 10)} />
        <NumberTicker value={count % 10} />
        <span className="text-xl ml-2 text-zinc-400 font-sans tracking-tight">mins</span>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// 6. Magnetic "Pull" Buttons
// -----------------------------------------------------------------------------
function MagneticButton() {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const handleMouse = (e: React.MouseEvent<HTMLDivElement>) => {
    const { clientX, clientY } = e;
    const { height, width, left, top } = ref.current!.getBoundingClientRect();
    const middleX = clientX - (left + width / 2);
    const middleY = clientY - (top + height / 2);
    setPosition({ x: middleX * 0.3, y: middleY * 0.3 }); // 0.3 is the pull strength
  };

  const reset = () => setPosition({ x: 0, y: 0 });

  const { x, y } = position;

  return (
    <div className="flex justify-center items-center h-full w-full p-4">
      <motion.div
        ref={ref}
        onMouseMove={handleMouse}
        onMouseLeave={reset}
        animate={{ x, y }}
        transition={{ type: "spring", stiffness: 350, damping: 15, mass: 0.5 }}
        className="w-full max-w-[200px]"
      >
        <button className="w-full bg-brand text-white py-3 px-6 rounded-full font-bold shadow-lg shadow-brand/30 hover:scale-105 transition-transform duration-100">
          Save to Plan
        </button>
      </motion.div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// 7. Swipe-to-Save Discovery Stack
// -----------------------------------------------------------------------------
function SwipeStack() {
  const [cards, setCards] = useState([
    { id: 1, title: "Funnel Cake", color: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-800 dark:text-amber-200" },
    { id: 2, title: "Demolition Derby", color: "bg-rose-100 dark:bg-rose-900/30", text: "text-rose-800 dark:text-rose-200" },
    { id: 3, title: "Petting Zoo", color: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-800 dark:text-emerald-200" },
  ]);

  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-15, 15]);

  const handleDragEnd = (event: MouseEvent | TouchEvent | PointerEvent, info: import("framer-motion").PanInfo) => {
    if (info.offset.x > 100 || info.offset.x < -100) {
      setCards(cards.slice(1));
      x.set(0);
    }
  };

  if (cards.length === 0) {
    return (
      <div className="h-48 w-full border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-2xl flex items-center justify-center text-zinc-400 font-medium">
        All caught up!
      </div>
    );
  }


  return (
    <div className="relative h-48 w-full flex items-center justify-center perspective-[1000px]">
      <AnimatePresence>
        {cards.map((card, index) => {
          const isTop = index === 0;
          return (
            <motion.div
              key={card.id}
              style={{
                x: isTop ? x : 0,
                rotate: isTop ? rotate : 0,
                zIndex: cards.length - index,
              }}
              drag={isTop ? "x" : false}
              dragConstraints={{ left: 0, right: 0 }}
              onDragEnd={isTop ? handleDragEnd : undefined}
              initial={{ scale: 0.95, y: 10, opacity: 0 }}
              animate={{ 
                scale: 1 - index * 0.05, 
                y: index * 10,
                opacity: 1 - index * 0.2
              }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className={cn("absolute w-full h-full rounded-2xl p-6 shadow-xl flex items-center justify-center cursor-grab active:cursor-grabbing", card.color)}
            >
              <h3 className={cn("text-2xl font-bold", card.text)}>{card.title}</h3>
              {isTop && (
                <div className="absolute inset-0 pointer-events-none rounded-2xl border-4 border-white/0" />
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
      <div className="absolute bottom-4 left-4 right-4 flex justify-between pointer-events-none opacity-50 text-xs font-medium px-2">
        <span className="flex items-center gap-1"><ArrowLeft className="h-3 w-3" /> Skip</span>
        <span className="flex items-center gap-1">Save <ArrowRight className="h-3 w-3" /></span>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// 8. Liquid Morphing FAB
// -----------------------------------------------------------------------------
function MorphingFAB() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <AnimatePresence>
        {!open && (
          <motion.button
            layoutId="fab-container"
            onClick={() => setOpen(true)}
            className="absolute bottom-4 right-4 w-14 h-14 bg-zinc-900 dark:bg-white text-white dark:text-black rounded-full flex items-center justify-center shadow-xl z-10"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <motion.div layoutId="fab-icon">
              <Search size={24} />
            </motion.div>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.div
            layoutId="fab-container"
            className="absolute inset-0 bg-white dark:bg-zinc-900 rounded-2xl z-20 overflow-hidden shadow-2xl flex flex-col"
          >
            <div className="p-4 flex items-center gap-3 border-b border-zinc-100 dark:border-zinc-800">
              <motion.div layoutId="fab-icon" className="text-zinc-400">
                <Search size={20} />
              </motion.div>
              <input 
                autoFocus
                placeholder="Search..." 
                className="flex-1 bg-transparent outline-none font-medium"
              />
              <button 
                onClick={() => setOpen(false)}
                className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-4 flex-1 bg-zinc-50 dark:bg-zinc-950">
              <p className="text-sm text-zinc-500">This is a morphing layout animation with Framer Motion.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}


// -----------------------------------------------------------------------------
// 9. Glassmorphic Bento Dashboard
// -----------------------------------------------------------------------------
function BentoCard({ children, className, delay = 0 }: { children: React.ReactNode, className?: string, delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: delay * 0.1, ease: [0.23, 1, 0.32, 1] }}
      className={cn(
        "relative rounded-[32px] overflow-hidden bg-white/40 dark:bg-black/20 backdrop-blur-xl border border-white/40 dark:border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.04)]",
        className
      )}
    >
      {/* Magic Hover Glow placeholder - normally uses clientX/Y but simplified here */}
      <div className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity duration-500 pointer-events-none"
           style={{ background: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.2) 0%, transparent 60%)' }} />
      {children}
    </motion.div>
  );
}


import { MapSearchOverlay } from "./MapSearchOverlay";

// -----------------------------------------------------------------------------
// MAIN PAGE
// -----------------------------------------------------------------------------
export default function SandboxPage() {
  // 10. Scroll-Driven Parallax Header (Wrapper)
  const { scrollY } = useScroll();
  const headerY = useTransform(scrollY, [0, 300], [0, 100]);
  const headerOpacity = useTransform(scrollY, [0, 200], [1, 0]);
  const headerScale = useTransform(scrollY, [0, 300], [1, 1.1]);

  return (
    <div className="min-h-screen bg-[#F6F4F0] dark:bg-zinc-950 font-sans selection:bg-brand/20">
      
      {/* Scroll-Driven Parallax Background */}
      <motion.div 
        className="fixed top-0 left-0 right-0 h-[40vh] bg-gradient-to-br from-blue-100 to-purple-100 dark:from-indigo-950 dark:to-purple-950 flex items-center justify-center -z-10"
        style={{ y: headerY, opacity: headerOpacity, scale: headerScale }}
      >
        <div className="text-center">
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-zinc-800 dark:text-zinc-100 mb-2">
            UX Innovation Sandbox
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400 font-medium">10 Premium Experiences</p>
        </div>
      </motion.div>

      {/* Main Content Area */}
      <div className="pt-[35vh] pb-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-[240px]">
          
          {/* Item 1: Dynamic Island */}
          <BentoCard delay={1} className="md:col-span-2 flex items-center justify-center p-8 bg-zinc-200/50 dark:bg-zinc-800/50">
            <div className="w-full flex flex-col items-center gap-6">
              <span className="text-sm font-bold tracking-widest text-zinc-400 uppercase">1. Dynamic Island</span>
              <DynamicIsland />
              <p className="text-xs text-zinc-500 text-center max-w-xs mt-4">Tap to expand smooth layout animation</p>
            </div>
          </BentoCard>

          {/* Item 2: Tilt Card */}
          <BentoCard delay={2} className="flex items-center justify-center p-6">
            <div className="w-full flex flex-col items-center gap-4">
               <span className="text-sm font-bold tracking-widest text-zinc-400 uppercase">4. Holographic Tilt</span>
               <TiltCard />
            </div>
          </BentoCard>

          {/* Item 3: Command Menu */}
          <BentoCard delay={3} className="p-6 flex flex-col justify-center">
             <span className="text-sm font-bold tracking-widest text-zinc-400 uppercase mb-4 text-center">2. CMDK Global Menu</span>
             <CommandMenuSandbox />
             <p className="text-xs text-zinc-500 text-center mt-6">A frictionless command palette</p>
          </BentoCard>

          {/* Item 4: Vaul Drawer */}
          <BentoCard delay={4} className="p-6 flex flex-col items-center justify-center bg-gradient-to-b from-transparent to-white/50 dark:to-black/30">
             <span className="text-sm font-bold tracking-widest text-zinc-400 uppercase mb-6 text-center">3. True iOS Drawer</span>
             <BottomSheetSandbox />
             <p className="text-xs text-zinc-500 text-center mt-6">Built with vaul for native physics</p>
          </BentoCard>

          {/* Item 5: Ticker */}
          <BentoCard delay={5} className="p-6 flex flex-col items-center justify-center">
            <span className="text-sm font-bold tracking-widest text-zinc-400 uppercase mb-6 text-center">5. Scoreboard Ticker</span>
            <TickerDemo />
          </BentoCard>

          {/* Item 6: Magnetic Button */}
          <BentoCard delay={6} className="p-6 flex flex-col items-center justify-center">
            <span className="text-sm font-bold tracking-widest text-zinc-400 uppercase mb-2 text-center">6. Magnetic Pull</span>
            <div className="flex-1 w-full flex items-center justify-center rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700">
               <MagneticButton />
            </div>
          </BentoCard>

          {/* Item 7: Swipe Stack */}
          <BentoCard delay={7} className="p-6 flex flex-col items-center justify-center row-span-2">
            <span className="text-sm font-bold tracking-widest text-zinc-400 uppercase mb-6 text-center">7. Swipe Discovery</span>
            <SwipeStack />
            <p className="text-xs text-zinc-500 text-center mt-8">Drag cards left or right</p>
          </BentoCard>

          {/* Item 8 & 9: Morphing FAB & Glass Bento */}
          <BentoCard delay={8} className="p-0 flex flex-col relative overflow-hidden bg-zinc-200/50 dark:bg-zinc-800/50 min-h-[240px]">
            <div className="p-6 flex-1">
              <span className="text-sm font-bold tracking-widest text-zinc-400 uppercase block mb-2 text-center">8 & 9. Morphing FAB & Glass Bento</span>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 text-center mt-4">This entire grid uses staggered glassmorphism. Tap the FAB in the corner below.</p>
            </div>
            <MorphingFAB />
          </BentoCard>

          {/* Item 11: Map Search Discovery */}
          <BentoCard delay={9} className="md:col-span-2 lg:col-span-3 p-6 flex flex-col relative overflow-hidden">
            <span className="text-sm font-bold tracking-widest text-zinc-400 uppercase block mb-4 text-center">11. Interactive Map Discovery UI</span>
            <MapSearchOverlay />
            <p className="text-sm text-zinc-600 dark:text-zinc-400 text-center mt-6">
              A floating, bottom-aligned map search experience with native iOS bottom-sheet expansion and horizontal category chips.
            </p>
          </BentoCard>

        </div>
      </div>
    </div>
  );
}
