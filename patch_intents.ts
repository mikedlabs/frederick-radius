import fs from "fs";

let content = fs.readFileSync("src/data/intents.ts", "utf-8");

content = content.replace(
  `const CIVIC = new Set([
  "library",
  "government",
  "public-safety",
  "post-office",
  "voting",
  "transit",
  "civic",
]);`,
  `const CIVIC = new Set([
  "library",
  "government",
  "public-safety",
  "post-office",
  "voting",
  "transit",
  "civic",
  "parking",
]);`
);

content = content.replace(
  `      { key: "voting",        type: "category", label: "Voting",        icon: "Vote",        match: (p) => p.category === "voting" },
      { key: "worship",       type: "category", label: "Worship",       icon: "Church",      match: (p) => p.category === "worship" },`,
  `      { key: "voting",        type: "category", label: "Voting",        icon: "Vote",        match: (p) => p.category === "voting" },
      { key: "worship",       type: "category", label: "Worship",       icon: "Church",      match: (p) => p.category === "worship" },
      { key: "parking",       type: "category", label: "Parking",       icon: "Truck",       match: (p) => p.category === "parking" },
      { key: "transit",       type: "category", label: "Transit",       icon: "Truck",       match: (p) => p.category === "transit" },`
);

fs.writeFileSync("src/data/intents.ts", content);
console.log("Patched intents.ts");
