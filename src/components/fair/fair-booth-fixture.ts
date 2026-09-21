import type { FairLayoutData } from "@/lib/fair/layout";

// Synthetic geometry and artwork keep component tests independent of the feed.
const backgroundUrl = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="900" viewBox="0 0 1000 900"><rect width="1000" height="900" fill="white"/><path d="M60 120H940V820H60Z M60 450H940" fill="none" stroke="gray" stroke-width="2"/><text x="500" y="75" text-anchor="middle" font-family="sans-serif" font-size="30">Synthetic Fair layout</text></svg>')}`;
const booth = (id: string, label: string, x: number, y: number, vendorIds: string[] = [], rotationDeg = 0) => ({ id, label, x, y, width: 35, height: 35, rotationDeg, vendorIds });

export const fairBoothFixture: FairLayoutData = {
  schemaVersion: 1,
  showId: "18209",
  checkedAt: "2026-09-21T13:30:00.000Z",
  permission: { basis: "owner-attestation", attestedOn: "2026-09-21", scope: "Synthetic test fixture." },
  provenance: { guideUrl: "https://mobile.eventhub-floorplan.net/?Show_ID=18209", collectorCheckedAt: "2026-09-21T13:30:00.000Z", reviewedAt: "2026-09-21T13:30:00.000Z" },
  maps: [
    { id: "1", name: "Grandstand and Homegrown", shortName: "Grandstand", width: 1000, height: 900, imageWidth: 1000, imageHeight: 900, backgroundUrl, booths: [booth("1:1", "3", 350, 200, ["eventhub-2"]), booth("1:2", "30", 390, 200), booth("1:3", "", 430, 200)] },
    { id: "2", name: "Indoor exhibits", shortName: "Exhibits", width: 1000, height: 900, imageWidth: 1000, imageHeight: 800, backgroundUrl, annotations: [{ text: "Exhibit hall", x: 350, y: 150, rotationDeg: 0, fontSize: 24 }, { text: "Hidden source label", x: 5, y: 5, rotationDeg: 0, fontSize: 0 }], booths: [booth("2:4", "404", 400, 200, [], 30)] },
    { id: "3", name: "Machinery Row and West End", shortName: "Machinery Row", width: 1000, height: 900, imageWidth: 1000, imageHeight: 900, backgroundUrl, booths: [booth("3:5", "587", 550, 500, ["eventhub-1"]), booth("3:6", "588", 590, 500, ["eventhub-1"]), booth("3:7", "589", 630, 500)] },
  ],
  vendors: [
    { id: "eventhub-1", name: "White Rabbit x Rad Pies", profileId: "1", boothIds: ["3:5", "3:6"], richProfileId: "vendor-white-rabbit-rad-pies" },
    { id: "eventhub-2", name: "3 Brothers Café", profileId: "2", boothIds: ["1:1"] },
  ],
};
