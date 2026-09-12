import React, { useState } from "react";
import { Search, MapPin, Coffee, Utensils, Info, Navigation, X } from "lucide-react";
import { Drawer } from "vaul";

export function MapSearchOverlay() {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const categories = [
    { id: "food", icon: Utensils, label: "Food" },
    { id: "coffee", icon: Coffee, label: "Coffee" },
    { id: "info", icon: Info, label: "Info" },
    { id: "bathrooms", icon: Navigation, label: "Restrooms" },
  ];

  return (
    <div className="relative w-full h-[400px] bg-zinc-200 dark:bg-zinc-800 rounded-[32px] overflow-hidden flex flex-col justify-end">
      {/* Mock Map Background */}
      <div className="absolute inset-0 opacity-50 bg-[url('https://api.mapbox.com/styles/v1/mapbox/light-v11/static/-77.411,39.414,15,0/600x400?access_token=pk.eyJ1IjoiZXhhbXBsZSIsImEiOiJja3EzeGFleG0wYm0xMnFvNm1sdHlxd3Z0In0.example')] bg-cover bg-center" />
      
      <div className="absolute inset-0 flex items-center justify-center">
         <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center animate-pulse">
            <div className="w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-md" />
         </div>
      </div>

      {/* UI Overlay */}
      <div className="relative z-10 w-full p-4 flex flex-col gap-3 pb-6 bg-gradient-to-t from-black/40 to-transparent">
        
        {/* Floating Categories */}
        <div className="flex gap-2 overflow-x-auto snap-x pb-1 scrollbar-hide -mx-4 px-4">
          {categories.map(c => (
            <button 
              key={c.id}
              onClick={() => setActiveCategory(activeCategory === c.id ? null : c.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium snap-start whitespace-nowrap transition-colors shadow-sm ${
                activeCategory === c.id 
                  ? "bg-brand text-white" 
                  : "bg-white/90 dark:bg-zinc-900/90 backdrop-blur text-zinc-700 dark:text-zinc-200"
              }`}
            >
              <c.icon size={14} />
              {c.label}
            </button>
          ))}
        </div>

        {/* Vaul Bottom Sheet Search */}
        <Drawer.Root shouldScaleBackground>
          <Drawer.Trigger asChild>
            <div className="w-full bg-white dark:bg-zinc-900 rounded-2xl shadow-lg p-3 flex items-center gap-3 cursor-text">
              <Search size={20} className="text-zinc-400" />
              <span className="text-zinc-500 font-medium">Find places, rides, food...</span>
            </div>
          </Drawer.Trigger>
          <Drawer.Portal>
            <Drawer.Overlay className="fixed inset-0 bg-black/40 z-[100] backdrop-blur-sm" />
            <Drawer.Content className="bg-zinc-100 dark:bg-zinc-900 flex flex-col rounded-t-[32px] h-[85vh] mt-24 fixed bottom-0 left-0 right-0 z-[100] outline-none">
              <div className="p-4 bg-white dark:bg-zinc-800 rounded-t-[32px] flex-1 flex flex-col">
                <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-zinc-300 dark:bg-zinc-600 mb-6" />
                
                {/* Search Input inside Drawer */}
                <div className="flex items-center gap-3 bg-zinc-100 dark:bg-zinc-900 p-3 rounded-2xl mb-6">
                   <Search size={20} className="text-zinc-400" />
                   <input 
                     autoFocus
                     value={query}
                     onChange={(e) => setQuery(e.target.value)}
                     placeholder="Search the fairgrounds..."
                     className="flex-1 bg-transparent outline-none font-medium text-lg"
                   />
                   {query && (
                     <button onClick={() => setQuery("")} className="p-1 text-zinc-400 hover:text-zinc-600">
                       <X size={18} />
                     </button>
                   )}
                </div>

                <Drawer.Title className="sr-only">Map Search</Drawer.Title>
                <Drawer.Description className="sr-only">Search the map</Drawer.Description>

                <div className="flex-1 overflow-y-auto">
                   <h3 className="text-sm font-bold tracking-wider text-zinc-400 uppercase mb-4 px-2">Recent & Recommended</h3>
                   <div className="space-y-2">
                     {["Funnel Cake Stand", "Ferris Wheel", "First Aid", "Bus Route 40"].map((item, i) => (
                       <button key={i} className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors text-left">
                         <div className="w-10 h-10 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-zinc-500">
                           <MapPin size={18} />
                         </div>
                         <span className="font-medium text-zinc-800 dark:text-zinc-200">{item}</span>
                       </button>
                     ))}
                   </div>
                </div>
              </div>
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>

      </div>
    </div>
  );
}
