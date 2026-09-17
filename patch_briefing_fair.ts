import fs from "fs";

let content = fs.readFileSync("src/components/today/BriefingLine.tsx", "utf-8");

content = content.replace(
  "5. If there is a major event like a festival or holiday, mention it naturally.",
  "5. If there is a major event like a festival or holiday, mention it naturally.\n6. CRITICAL: If the current date is between Sept 18-26, 2026, The Great Frederick Fair is actively happening right now. You MUST mention the fair and the fair's daily grandstand headliner or event if provided in the context."
);

fs.writeFileSync("src/components/today/BriefingLine.tsx", content);
console.log("Patched BriefingLine.tsx with Fair context rules");
