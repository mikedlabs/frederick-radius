import fs from "fs";

let content = fs.readFileSync("src/app/(app)/today/page.tsx", "utf-8");

content = content.replace(
  `import BetaIntroCard from "@/components/today/BetaIntroCard";`,
  `import BetaIntroCard from "@/components/today/BetaIntroCard";\nimport FairTakeover from "@/components/today/FairTakeover";`
);

content = content.replace(
  `      <div className="space-y-6">
        <BetaIntroCard />
      </div>`,
  `      <div className="space-y-6">
        <BetaIntroCard />
      </div>\n\n      <FairTakeover />`
);

fs.writeFileSync("src/app/(app)/today/page.tsx", content);
console.log("Patched today/page.tsx with FairTakeover");
