import fs from "fs";

let content = fs.readFileSync("src/components/nav/MoreSheet.tsx", "utf-8");

content = content.replace(
  `import {
  Info,
  Wrench,
  Building2,
  Bus,
  Mountain,
  Settings as SettingsIcon,
    ShieldCheck,
  Waves,
  TreeDeciduous,
  Megaphone,
  Store,
  CalendarPlus,
} from "lucide-react";`,
  `import {
  Info,
  Wrench,
  Building2,
  Bus,
  Mountain,
  Settings as SettingsIcon,
  ShieldCheck,
  Waves,
  TreeDeciduous,
  Megaphone,
  Store,
  CalendarPlus,
  CircleParking,
} from "lucide-react";`
);

content = content.replace(
  `const USEFUL: Item[] = [
  { href: "/amenities", label: "Amenities", description: "Restrooms, water, wifi, EV charging, bike parking", icon: Wrench,        color: "var(--app-brand)" },
  { href: "/contacts",  label: "Contacts",  description: "City and county department directory",              icon: Building2,     color: "var(--app-ink-2)" },
  { href: "/transit",   label: "Transit",   description: "TransIT bus routes and stops",                      icon: Bus,           color: "var(--app-cool)" },
  { href: "/trails",    label: "Trails",    description: "200+ miles of hikes, towpaths, and rail-trails",    icon: Mountain,      color: "var(--app-positive)" },
  { href: "/parks",     label: "Parks",     description: "Public parks across all 12 municipalities",          icon: TreeDeciduous, color: "var(--app-brand-2)" },
  // "Water" tile collapsed into Rivers (May 2026 IA cleanup). The
  // /water page redirected to /rivers because both rendered the same
  // USGS gauge data; the intended "drinking fountains" surface lives
  // under the Pools/Amenities map filter when curated data lands.
  { href: "/rivers",    label: "Rivers & creeks", description: "Live USGS gauges · gage height + flow + 24-hour trend", icon: Waves, color: "var(--app-cool)" },
];`,
  `const USEFUL: Item[] = [
  { href: "/map?mode=browse&intent=civic&sub=parking", label: "Parking", description: "City garages and street parking rules", icon: CircleParking, color: "var(--app-brand)" },
  { href: "/map?mode=browse&intent=civic", label: "Amenities", description: "Restrooms, water, wifi, EV charging, bike parking", icon: Wrench,        color: "var(--app-brand-2)" },
  { href: "/contacts",  label: "Contacts",  description: "City and county department directory",              icon: Building2,     color: "var(--app-ink-2)" },
  { href: "/map?mode=browse&intent=civic&sub=transit",   label: "Transit",   description: "TransIT bus routes and stops",                      icon: Bus,           color: "var(--app-cool)" },
  { href: "/map?mode=browse&intent=outdoor&sub=trails",    label: "Trails",    description: "200+ miles of hikes, towpaths, and rail-trails",    icon: Mountain,      color: "var(--app-positive)" },
  { href: "/map?mode=browse&intent=outdoor&sub=parks",     label: "Parks",     description: "Public parks across all 12 municipalities",          icon: TreeDeciduous, color: "var(--app-brand-2)" },
  { href: "/map?mode=browse&intent=outdoor",    label: "Rivers & creeks", description: "Live USGS gauges · gage height + flow + 24-hour trend", icon: Waves, color: "var(--app-cool)" },
];`
);

fs.writeFileSync("src/components/nav/MoreSheet.tsx", content);
console.log("Patched MoreSheet.tsx");
