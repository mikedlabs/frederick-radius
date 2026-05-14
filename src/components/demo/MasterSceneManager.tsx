"use client";

import { useRef, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ChevronDown, ChevronUp } from "lucide-react";

// Import all 10 scenes
import Scene01_CinematicReveal from "./scenes/Scene01_CinematicReveal";
import Scene02_InteractiveMap from "./scenes/Scene02_InteractiveMap";
import Scene03_NoiseToSignal from "./scenes/Scene03_NoiseToSignal";
import Scene04_FourPillars from "./scenes/Scene04_FourPillars";
import Scene05_DataStory from "./scenes/Scene05_DataStory";
import Scene06_CommercialIntegration from "./scenes/Scene06_CommercialIntegration";
import Scene07_Ecosystem from "./scenes/Scene07_Ecosystem";
import Scene08_RadiusCoin from "./scenes/Scene08_RadiusCoin";
import Scene09_CivicHub from "./scenes/Scene09_CivicHub";
import Scene10_Vision from "./scenes/Scene10_Vision";

/**
 * FREDERICK RADIUS // MASTER SCENE MANAGER
 * Orchestrates the 10-scene cinematic experience
 * Fuses Google utility, Apple elegance, Tesla precision
 */
export default function MasterSceneManager() {
    const containerRef = useRef<HTMLDivElement>(null);
    const [activeScene, setActiveScene] = useState(0);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Scene Configuration
    const scenes = [
        { component: <Scene01_CinematicReveal key="scene-01" />, name: "Cinematic Reveal" },
        { component: <Scene02_InteractiveMap key="scene-02" />, name: "Interactive Map" },
        { component: <Scene03_NoiseToSignal key="scene-03" />, name: "Noise vs Signal" },
        { component: <Scene04_FourPillars key="scene-04" />, name: "Four Pillars" },
        { component: <Scene05_DataStory key="scene-05" />, name: "Data Story" },
        { component: <Scene06_CommercialIntegration key="scene-06" />, name: "Business Tools" },
        { component: <Scene07_Ecosystem key="scene-07" />, name: "Community" },
        { component: <Scene08_RadiusCoin key="scene-08" />, name: "Radius Coin" },
        { component: <Scene09_CivicHub key="scene-09" />, name: "Civic Hub" },
        { component: <Scene10_Vision key="scene-10" />, name: "The Vision" },
    ];

    // Update active scene based on scroll progress
    useEffect(() => {
        const handleScroll = () => {
            if (!containerRef.current) return;
            const scrollPosition = window.scrollY;
            const sceneHeight = window.innerHeight;
            const currentScene = Math.min(
                Math.floor(scrollPosition / sceneHeight),
                scenes.length - 1
            );
            setActiveScene(currentScene);
        };

        window.addEventListener('scroll', handleScroll);
        handleScroll(); // Call once on mount

        return () => window.removeEventListener('scroll', handleScroll);
    }, [scenes.length]);

    const scrollToScene = (index: number) => {
        if (index < 0 || index >= scenes.length) return;
        const sceneHeight = window.innerHeight;
        window.scrollTo({
            top: index * sceneHeight,
            behavior: "smooth",
        });
    };

    if (!mounted) return null;

    return (
        <div ref={containerRef} className="relative bg-[#030014]">
            {/* Progress Bar (Top) */}
            <motion.div
                className="fixed top-0 left-0 right-0 h-1 bg-gradient-to-r from-violet-500 via-purple-500 to-amber-500 z-50 origin-left shadow-[0_0_20px_rgba(168,85,247,0.6)]"
                style={{
                    scaleX: (activeScene + 1) / scenes.length,
                    transformOrigin: 'left'
                }}
            />

            {/* Scene Counter (Top Right) */}
            <div className="fixed top-6 right-6 z-50 backdrop-blur-md bg-white/10 border border-white/20 rounded-full px-4 py-2 shadow-xl">
                <span className="text-white font-medium text-sm">
                    {activeScene + 1} / {scenes.length}
                </span>
            </div>

            {/* Navigation Dots (Right Side) */}
            <div className="fixed right-8 top-1/2 -translate-y-1/2 z-50 flex flex-col gap-3">
                {scenes.map((scene, index) => (
                    <button
                        key={index}
                        onClick={() => scrollToScene(index)}
                        className="group relative"
                        aria-label={`Go to ${scene.name}`}
                    >
                        <div
                            className={`w-3 h-3 rounded-full transition-all duration-300 ${activeScene === index
                                ? "bg-gradient-to-r from-violet-500 to-amber-500 scale-125 shadow-[0_0_15px_rgba(168,85,247,0.8)]"
                                : "bg-white/20 hover:bg-white/50 hover:scale-110"
                                }`}
                        />
                        {/* Tooltip */}
                        <div className="absolute right-6 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                            <div className="backdrop-blur-md bg-black/80 text-white text-xs px-3 py-2 rounded-lg border border-white/20">
                                {scene.name}
                            </div>
                        </div>
                    </button>
                ))}
            </div>

            {/* Navigation Arrows (Bottom Right) */}
            <div className="fixed bottom-8 right-8 z-50 flex flex-col gap-2">
                <motion.button
                    onClick={() => scrollToScene(activeScene - 1)}
                    disabled={activeScene === 0}
                    className="p-3 rounded-full backdrop-blur-md bg-white/10 border border-white/20 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-xl"
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                >
                    <ChevronUp className="w-6 h-6 text-white" />
                </motion.button>
                <motion.button
                    onClick={() => scrollToScene(activeScene + 1)}
                    disabled={activeScene === scenes.length - 1}
                    className="p-3 rounded-full bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-[0_0_20px_rgba(168,85,247,0.5)]"
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                >
                    <ChevronDown className="w-6 h-6 text-white" />
                </motion.button>
            </div>

            {/* Scenes Container */}
            {scenes.map((scene, index) => (
                <motion.div
                    key={index}
                    className="min-h-screen w-full relative flex items-center justify-center"
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: false, amount: 0.5 }}
                    transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                >
                    {scene.component}
                </motion.div>
            ))}
        </div>
    );
}
