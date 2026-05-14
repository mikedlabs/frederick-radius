"use client";

import { useRef, useState, useEffect } from "react";
import { motion, useScroll } from "framer-motion";
import { ChevronDown, ChevronUp } from "lucide-react";
import MapHeroScene from "./scenes/MapHeroScene";
import NarrativeScene from "./scenes/NarrativeScene";

export default function SceneManager() {
    const containerRef = useRef<HTMLDivElement>(null);
    const [activeScene, setActiveScene] = useState(0);

    const scenes = [
        <MapHeroScene key="hero" />,
        <NarrativeScene
            key="challenge"
            title="The Challenge"
            subtitle="Fragmented Information"
            content="Frederick County faces a unique challenge - our 12 distinct municipalities currently operate through separate channels, creating information silos. With 4,500+ businesses spread across 1,660 square miles, how does anyone stay truly connected?"
            highlight="We're solving the 'how do you keep up?' problem."
            alignment="left"
        />,
        <NarrativeScene
            key="solution"
            title="The Solution"
            subtitle="Unified Digital Hub"
            content="FrederickRadius elegantly bridges our county's connectivity gap. Our live interactive map visualizes real-time events, offers, and businesses filtered by your custom radius. Instant notifications keep you informed about everything from road closures to pop-up markets."
            highlight="One beautiful interface for 305,000+ residents."
            alignment="right"
        />,
        <NarrativeScene
            key="impact"
            title="Economic Impact"
            subtitle="Powering Local Growth"
            content="Our business dashboard revolutionizes local commerce with enterprise-grade tools. Real-time analytics show performance metrics like daily visitor increases and engagement rates. It's democratizing data for Frederick County's entrepreneurial spirit."
            highlight="$560 Million in Annual Economic Impact"
            alignment="center"
        />
    ];

    const { scrollYProgress } = useScroll({
        target: containerRef,
        offset: ["start start", "end end"],
    });

    // Update active scene based on scroll progress
    useEffect(() => {
        const unsubscribe = scrollYProgress.on("change", (latest) => {
            const totalScenes = scenes.length;
            const currentScene = Math.min(
                Math.floor(latest * totalScenes),
                totalScenes - 1
            );
            setActiveScene(currentScene);
        });
        return () => unsubscribe();
    }, [scrollYProgress, scenes.length]);

    const scrollToScene = (index: number) => {
        if (index < 0 || index >= scenes.length) return;
        const sceneHeight = window.innerHeight;
        window.scrollTo({
            top: index * sceneHeight,
            behavior: "smooth",
        });
    };

    return (
        <div ref={containerRef} className="relative bg-[#030014]">
            {/* Progress Bar */}
            <motion.div
                className="fixed top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-secondary to-accent z-50 origin-left"
                style={{ scaleX: scrollYProgress }}
            />

            {/* Navigation Controls */}
            <div className="fixed right-8 top-1/2 -translate-y-1/2 z-50 flex flex-col gap-4">
                {scenes.map((_, index) => (
                    <button
                        key={index}
                        onClick={() => scrollToScene(index)}
                        className={`w-3 h-3 rounded-full transition-all duration-300 ${activeScene === index ? "bg-primary scale-125" : "bg-white/20 hover:bg-white/50"
                            }`}
                    />
                ))}
            </div>

            <div className="fixed bottom-8 right-8 z-50 flex flex-col gap-2">
                <button
                    onClick={() => scrollToScene(activeScene - 1)}
                    disabled={activeScene === 0}
                    className="p-3 rounded-full bg-white/10 backdrop-blur-md hover:bg-white/20 disabled:opacity-30 transition-all"
                >
                    <ChevronUp className="w-6 h-6 text-white" />
                </button>
                <button
                    onClick={() => scrollToScene(activeScene + 1)}
                    disabled={activeScene === scenes.length - 1}
                    className="p-3 rounded-full bg-primary hover:bg-primary/80 disabled:opacity-30 transition-all shadow-[0_0_20px_rgba(112,0,255,0.5)]"
                >
                    <ChevronDown className="w-6 h-6 text-white" />
                </button>
            </div>

            {/* Scenes */}
            {scenes.map((child, index) => (
                <div
                    key={index}
                    className="min-h-screen w-full relative flex items-center justify-center overflow-hidden sticky top-0"
                >
                    <motion.div
                        className="w-full h-full absolute inset-0"
                        initial={{ opacity: 0 }}
                        animate={{
                            opacity: activeScene === index ? 1 : 0,
                            scale: activeScene === index ? 1 : 0.95,
                            filter: activeScene === index ? "blur(0px)" : "blur(10px)"
                        }}
                        transition={{ duration: 0.8, ease: "easeInOut" }}
                    >
                        {child}
                    </motion.div>
                </div>
            ))}

            {/* Scroll Spacer - makes the page scrollable */}
            <div style={{ height: `${scenes.length * 100}vh` }} />
        </div>
    );
}

