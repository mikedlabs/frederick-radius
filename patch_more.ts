import fs from "fs";

let content = fs.readFileSync("src/components/nav/MoreSheet.tsx", "utf-8");

// Add Megaphone icon import
content = content.replace(
  `  TreeDeciduous,\n} from "lucide-react";`,
  `  TreeDeciduous,\n  Megaphone,\n  Store,\n  CalendarPlus,\n} from "lucide-react";`
);

// Add COMMUNITY section
const communitySection = `
const COMMUNITY: Item[] = [
  { href: "/submit/event", label: "Submit Event", description: "Add a local event to the calendar", icon: CalendarPlus, color: "var(--app-brand)" },
  { href: "/submit/place", label: "Add Place",    description: "Submit a missing food truck, shop, or park", icon: Store, color: "var(--app-accent)" },
  { href: "/claim",        label: "Claim Page",   description: "Claim your business to manage hours and details", icon: Megaphone, color: "var(--app-positive)" },
];
`;

content = content.replace(
  `const USEFUL: Item[] = [`,
  `${communitySection}\nconst USEFUL: Item[] = [`
);

// Render the COMMUNITY section
content = content.replace(
  `<IconCluster heading="Useful" items={USEFUL} onClose={close} columns={4} />`,
  `<IconCluster heading="Locals & Business" items={COMMUNITY} onClose={close} columns={3} />\n        <IconCluster heading="Useful" items={USEFUL} onClose={close} columns={4} />`
);

fs.writeFileSync("src/components/nav/MoreSheet.tsx", content);
console.log("Patched MoreSheet.tsx");
