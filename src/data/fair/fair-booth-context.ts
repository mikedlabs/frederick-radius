/**
 * Original, schematic orientation layer for the reviewed 2026 booth inventory.
 * Manually reviewed against the three source PNGs on 2026-09-21. Coordinates
 * use each source's 1600-unit-wide canvas, not latitude/longitude. The source
 * pages contain seven separate diagrams; they are not geographic map tiles.
 *
 * Only structural outlines and factual labels are redrawn. Publisher branding,
 * page furniture, overview artwork, utility symbols and existing JSON source
 * annotations are deliberately excluded. Paths are orientation, never routes.
 */
export interface FairBoothContextBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface FairBoothContextPath {
  readonly id: string;
  readonly kind: "building" | "road" | "boundary";
  readonly d: string;
}

export interface FairBoothContextLabel {
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly rotation?: number;
}

export interface FairBoothNeighborhood {
  readonly id: string;
  readonly mapId: string;
  readonly name: string;
  readonly bounds: FairBoothContextBounds;
  readonly boothIds: readonly string[];
  /** Reviewed nearby landmark, not a coordinate or route for an individual booth. */
  readonly groundsFeatureId?: string;
}

export interface FairBoothMapContext {
  readonly mapId: string;
  readonly bounds: FairBoothContextBounds;
  readonly paths: readonly FairBoothContextPath[];
  readonly labels: readonly FairBoothContextLabel[];
  readonly neighborhoods: readonly FairBoothNeighborhood[];
}

// Ranges encode exact reviewed source IDs, not a guess based on booth numbers.
// Tests compare these lists with the current artifact and each diagram's bounds.
function sourceIds(mapId: string, ranges: readonly (readonly [number, number])[], extras: readonly number[] = []): readonly string[] {
  return [...ranges.flatMap(([first, last]) => Array.from({ length: last - first + 1 }, (_, index) => first + index)), ...extras]
    .map((id) => `${mapId}:${id}`);
}

export const fairBoothNeighborhoods: readonly FairBoothNeighborhood[] = [
  {
    id: "grandstand-left", mapId: "9564", name: "Under Grandstand Left",
    bounds: { x: 60, y: 470, width: 1480, height: 505 },
    boothIds: sourceIds("9564", [[3353095, 3353135]]),
  },
  {
    id: "grandstand-right", mapId: "9564", name: "Under Grandstand Right",
    bounds: { x: 60, y: 1080, width: 590, height: 310 },
    boothIds: sourceIds("9564", [[3353136, 3353152]]),
  },
  {
    id: "homegrown", mapId: "9564", name: "Homegrown",
    bounds: { x: 820, y: 1080, width: 720, height: 320 },
    boothIds: sourceIds("9564", [[3353153, 3353170]]),
  },
  {
    id: "outside-grandstands", mapId: "9565", name: "Outside Grandstands",
    bounds: { x: 60, y: 510, width: 1480, height: 895 },
    boothIds: sourceIds("9565", [[3353222, 3353335], [3353443, 3353447], [3353449, 3353471], [3466509, 3466510], [3490256, 3490258]]),
  },
  {
    id: "poultry-farm-garden", mapId: "9565", name: "Poultry, Rabbit & Farm and Garden",
    bounds: { x: 60, y: 1540, width: 1480, height: 910 },
    boothIds: sourceIds("9565", [[3353336, 3353442]], [3353448, 3474793]),
  },
  {
    id: "machinery-row", mapId: "9566", name: "Machinery Row",
    bounds: { x: 60, y: 510, width: 1480, height: 570 },
    boothIds: sourceIds("9566", [[3353477, 3353596], [3353650, 3353652]]),
  },
  {
    id: "west-end", mapId: "9566", name: "West End by Dairy Barns",
    bounds: { x: 60, y: 1185, width: 1075, height: 670 },
    boothIds: sourceIds("9566", [[3353597, 3353649], [3353654, 3353655]], [3401782]),
  },
];

export const fairBoothMapContexts: Readonly<Record<string, FairBoothMapContext>> = {
  "9564": {
    mapId: "9564",
    bounds: { x: 60, y: 470, width: 1480, height: 930 },
    neighborhoods: fairBoothNeighborhoods.filter((area) => area.mapId === "9564"),
    paths: [
      { id: "grandstand-left-wall", kind: "boundary", d: "M 80 790 V 492 H 1521 V 947 H 1509 M 1450 947 H 1129 M 1086 947 H 584 M 545 947 H 80 V 860" },
      { id: "grandstand-right-wall", kind: "boundary", d: "M 135 1359 H 81 V 1102 H 623 V 1308 M 623 1359 H 194" },
      { id: "grandstand-right-steps", kind: "boundary", d: "M 567 1321 L 571 1359 M 575 1321 L 579 1359 M 583 1321 L 587 1359 M 591 1321 L 595 1359 M 599 1321 L 603 1359" },
      { id: "homegrown-wall", kind: "boundary", d: "M 840 1217 V 1102 M 880 1102 H 1520 V 1216 M 1520 1268 V 1381 H 840 V 1269" },
      { id: "homegrown-corner", kind: "boundary", d: "M 1335 1102 L 1474 1200 H 1520" },
    ],
    labels: [
      { x: 128, y: 832, text: "Entrance" },
      { x: 565, y: 951, text: "Door" },
      { x: 1107, y: 951, text: "Door" },
      { x: 1478, y: 951, text: "Door" },
      { x: 159, y: 1351, text: "Entrance" },
      { x: 614, y: 1337, text: "Door", rotation: -90 },
      { x: 582, y: 1342, text: "Steps", rotation: -90 },
      { x: 885, y: 1248, text: "Entrance" },
      { x: 859, y: 1107, text: "Door" },
      { x: 1514, y: 1243, text: "Door", rotation: -90 },
    ],
  },
  "9565": {
    mapId: "9565",
    bounds: { x: 60, y: 510, width: 1480, height: 1940 },
    neighborhoods: fairBoothNeighborhoods.filter((area) => area.mapId === "9565"),
    paths: [
      { id: "outside-building-7", kind: "building", d: "M 88 594 H 974 V 635 H 88 Z" },
      { id: "outside-building-8", kind: "building", d: "M 1008 594 C 1089 602 1198 566 1259 526 L 1286 559 C 1221 609 1110 640 1022 633 Z" },
      { id: "outside-building-9", kind: "building", d: "M 1274 682 H 1473 V 1193 H 1274 Z M 1473 682 L 1513 703 V 829 H 1473" },
      { id: "outside-building-3", kind: "building", d: "M 468 1214 H 544 V 1249 H 582 V 1317 H 468 Z" },
      { id: "outside-building-2", kind: "building", d: "M 779 1263 H 964 V 1307 H 779 Z" },
      // Race track edges are open orientation lines, not an inferred route polygon.
      { id: "race-track-inner", kind: "road", d: "M 483 1556 C 650 1785 1128 1895 1412 1828" },
      { id: "race-track-outer", kind: "road", d: "M 356 1573 C 433 1790 848 2025 1440 1935" },
      { id: "trackside-lane-edge", kind: "road", d: "M 326 1599 V 1896 L 555 2033 H 1440 V 1935" },
      { id: "farm-lane-edge", kind: "road", d: "M 78 2217 H 641 L 871 2148 H 1438 V 2436 M 1478 2436 V 2132 H 1517 M 1478 1951 V 2038 H 1517" },
      { id: "farm-building-9", kind: "building", d: "M 78 1804 H 209 V 1984 H 78 Z" },
      { id: "farm-building-13", kind: "building", d: "M 277 2224 H 422 V 2409 H 277 Z" },
      { id: "farm-building-14", kind: "building", d: "M 486 2222 H 631 V 2407 H 486 Z" },
      { id: "farm-building-14a", kind: "building", d: "M 691 2204 H 852 V 2392 H 691 Z" },
      { id: "farm-building-15", kind: "building", d: "M 1274 2188 H 1334 V 2288 H 1274 Z" },
    ],
    labels: [
      { x: 507, y: 625, text: "Building 7" },
      { x: 1165, y: 598, text: "Building 8", rotation: -16 },
      { x: 684, y: 705, text: "Concession Way" },
      { x: 1375, y: 934, text: "Building 9" },
      { x: 1372, y: 785, text: "Section J" },
      { x: 558, y: 905, text: "Section H" },
      { x: 963, y: 1098, text: "Section K" },
      { x: 1224, y: 1303, text: "Section I" },
      { x: 525, y: 1290, text: "Building 3" },
      { x: 870, y: 1299, text: "Building 2" },
      { x: 773, y: 1234, text: "The Midway" },
      { x: 299, y: 1768, text: "Section M", rotation: -90 },
      { x: 700, y: 1989, text: "Section N" },
      { x: 581, y: 2159, text: "Section O" },
      { x: 1110, y: 2228, text: "Section Q" },
      { x: 860, y: 1873, text: "Race Track" },
      { x: 144, y: 1885, text: "Building 9" },
      { x: 350, y: 2320, text: "Building 13" },
      { x: 560, y: 2320, text: "Building 14" },
      { x: 772, y: 2306, text: "Building 14A" },
      { x: 1304, y: 2240, text: "Building 15" },
      { x: 1464, y: 2150, text: "Welcome Way", rotation: -90 },
      { x: 1455, y: 2408, text: "Gate 3" },
    ],
  },
  "9566": {
    mapId: "9566",
    bounds: { x: 60, y: 510, width: 1480, height: 1345 },
    neighborhoods: fairBoothNeighborhoods.filter((area) => area.mapId === "9566"),
    paths: [
      { id: "machinery-row-upper", kind: "road", d: "M 80 660 H 488 M 581 660 H 1240 C 1396 660 1420 765 1441 935 V 570" },
      { id: "machinery-row-lower", kind: "road", d: "M 80 693 H 1217 C 1335 693 1381 751 1384 822 L 1390 991 H 1278" },
      { id: "welcome-way-east", kind: "road", d: "M 1469 570 V 992 H 1518 M 1288 1037 H 1518" },
      { id: "milky-way-north", kind: "road", d: "M 80 1214 L 1115 1208" },
      { id: "milky-way-west", kind: "road", d: "M 80 1250 L 681 1244 C 430 1370 310 1530 317 1674" },
      { id: "west-end-lane", kind: "road", d: "M 1115 1238 C 979 1191 697 1260 525 1412 C 414 1510 350 1638 372 1720 Q 382 1756 423 1768 H 675" },
      { id: "west-building-32", kind: "building", d: "M 103 1289 H 226 V 1558 H 103 Z" },
      { id: "west-building-43", kind: "building", d: "M 178 1605 L 254 1576 L 289 1684 L 214 1711 Z" },
    ],
    labels: [
      { x: 562, y: 573, text: "Gate 4A" },
      { x: 1452, y: 562, text: "Gate 4" },
      { x: 533, y: 654, text: "Info" },
      { x: 1182, y: 578, text: "Food Vendor Compound" },
      { x: 826, y: 685, text: "Machinery Row" },
      { x: 1400, y: 1024, text: "Welcome Way" },
      { x: 221, y: 1241, text: "Milky Way" },
      { x: 164, y: 1430, text: "Building 32" },
      { x: 233, y: 1650, text: "Building 43", rotation: -20 },
      { x: 520, y: 1801, text: "Tunnel" },
    ],
  },
};

const neighborhoodByBooth = new Map(fairBoothNeighborhoods.flatMap((area) => area.boothIds.map((id) => [id, area] as const)));

export function findFairBoothNeighborhood(boothId: string): FairBoothNeighborhood | undefined {
  return neighborhoodByBooth.get(boothId);
}
