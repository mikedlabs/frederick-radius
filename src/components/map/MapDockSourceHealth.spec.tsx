// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MapDock, { type MapDockProps } from "./MapDock";
const edge=vi.hoisted(()=>({params:new URLSearchParams(),replace:vi.fn()}));
vi.mock("next/navigation",()=>({useRouter:()=>({replace:edge.replace}),useSearchParams:()=>edge.params}));
vi.mock("@/hooks/useFocusTrap",()=>({useFocusTrap:()=>{}}));
let root:Root;let host:HTMLDivElement;
const noop=()=>{};
function props(health:MapDockProps["mapLayerSourceHealth"]):MapDockProps {
  const layerHealth={status:"empty" as const,count:0,source:"Public feed",timestamp:null};
  return {
    browse:{openNow:false,openNowCount:0,dealsOn:false,dealsTodayCount:0,musicTonight:false,musicTonightCount:0,timeMode:"all",timeModeExplicit:false,everythingCount:0,intentCounts:{},subCounts:{},eventWindowCounts:{}},
    placeCount:0,eventCount:0,closingSoonCount:0,placesInView:[],placesInViewOrigin:null,onPickPlaceInView:noop,
    q:"",setQ:noop,searchMatches:[],searchPending:false,searchUnavailable:false,retrySearch:noop,searchOpeningId:null,pickSearch:noop,searchDistanceOriginLabel:null,
    savedCount:0,showSavedOnly:false,setShowSavedOnly:noop,fieldNotesCount:0,fieldNotesOnly:false,setFieldNotesOnly:noop,
    amenityCount:0,amenityGroupCounts:{},communityReportCount:0,amenityGroups:new Set(),setAmenityGroups:noop,
    civicAvailable:false,showCivic:false,setShowCivic:noop,transitHealth:layerHealth,showTransit:false,setShowTransit:noop,liveBusSnapshot:null,transitAlertSnapshot:null,
    trailCount:0,showTrails:false,setShowTrails:noop,scenicRouteCount:0,showScenicRoutes:false,setShowScenicRoutes:noop,coveredBridgeCount:0,showCoveredBridges:false,setShowCoveredBridges:noop,
    aerialCount:0,showAerial:false,setShowAerial:noop,aerialSeasons:[],aerialSeason:"",onAerialSeason:noop,cemeteryCount:0,showCemeteries:false,setShowCemeteries:noop,
    parkingCount:1,providerLayersAvailable:true,mapLayerSourceHealth:health,retryMapLayerGroups:vi.fn(),showParking:true,setShowParking:noop,
    showRadar:false,setShowRadar:noop,radarHealth:layerHealth,roadsNowActive:false,roadsNowFullyOn:false,setShowRoadsNow:noop,showTraffic:false,setShowTraffic:noop,
    floodContextCount:0,snowRouteCount:0,radarFrameEpoch:null,showIncidents:false,setShowIncidents:noop,incidentHealth:layerHealth,showRotorcraft:false,setShowRotorcraft:noop,showCameras:false,setShowCameras:noop,cameraHealth:layerHealth,
    activeOverlays:[],toggleOverlay:noop,scrubHour:null,setScrubHour:noop,userLoc:null,showLocationIntro:false,dismissLocationIntro:noop,locating:false,geoMsg:null,goNearMe:noop,flyTo:noop,fitCounty:noop,shareCameraParam:()=>null,
    discoveries:[],selectedDiscoveryId:null,onSelectDiscovery:noop,onPaneOpenChange:noop,radiusScenes:[],activeRadiusSceneId:null,onRadiusScene:noop,onExitRadiusScene:noop,
  };
}
beforeEach(()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date("2026-10-06T20:02:00Z"));
 (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 vi.stubGlobal("requestAnimationFrame",()=>0);vi.stubGlobal("cancelAnimationFrame",()=>{});
 host=document.createElement("div");document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.useRealTimers();vi.unstubAllGlobals();});
async function openLayers(input:MapDockProps){
 await act(async()=>root.render(createElement(MapDock,input)));
 await act(async()=> (host.querySelector('button[aria-label="Choose what to see on this map"]') as HTMLButtonElement).click());
 const around=Array.from(host.querySelectorAll("button")).find(button=>button.querySelector("strong")?.textContent==="Get around")!;
 await act(async()=>around.click());
 return host.querySelector('[role="status"].dock-source-health')!;
}
describe("retained MapDock source warning",()=>{
 it("labels older mapped reports as history beside the source check, without a current incident count",async()=>{
  const input=props(undefined);
  input.roadsNowActive=true;input.showIncidents=true;
  input.incidentHealth={status:"empty",count:0,earlierCount:1,source:"Frederick Scanner",timestamp:"2026-10-06T20:00:00Z",timestampBasis:"checked"};
  await openLayers(input);
  expect(host.textContent).toContain("No recent public travel reports are mapped.");
  expect(host.textContent).toContain("1 earlier public report retained as history");
  expect(host.textContent).toContain("The source was checked at");
  expect(host.textContent).not.toContain("1 current travel incident");
 });
 it("does not invent retained history when a previously empty check is stale",async()=>{
  const input=props(undefined);
  input.roadsNowActive=true;input.showIncidents=true;
  input.incidentHealth={status:"stale",count:0,earlierCount:0,source:"Frederick Scanner",timestamp:"2026-10-06T20:00:00Z",timestampBasis:"checked"};
  await openLayers(input);
  expect(host.textContent).toContain("Unable to verify current public incident reports.");
  expect(host.textContent).not.toContain("Earlier public reports retained");
  expect(host.textContent).not.toContain("retained as history");
 });
 it("keeps unavailable-source and empty-layer warning alongside the retained snapshot age",async()=>{
   const input=props({parking:{status:"unavailable",unavailable:["Parking occupancy"],stale:true,asOf:"2026-10-06T20:00:00Z"}});
   const notice=await openLayers(input);
   expect(notice.getAttribute("aria-label")).toContain("Parking occupancy");
   expect(notice.textContent).toContain("unavailable");
   expect(notice.textContent).toContain("An empty layer does not mean there are no results.");
   expect(notice.textContent).toContain("2 minutes old");
   await act(async()=> (notice.querySelector("button") as HTMLButtonElement).click());
   expect(input.retryMapLayerGroups).toHaveBeenCalledWith(["parking"]);
 });
 it("keeps the unavailable distinction when another pane group is only partial",async()=>{
   const notice=await openLayers(props({parking:{status:"unavailable",unavailable:["Parking occupancy"],stale:true,asOf:"2026-10-06T20:00:00Z"},transit:{status:"partial",unavailable:["Transit routes"]}}));
   expect(notice.textContent).toContain("An empty layer does not mean there are no results.");
   expect(notice.textContent).toContain("2 minutes old");
 });
 it("control: a retained partial snapshot still has older-data recovery",async()=>{
   const notice=await openLayers(props({parking:{status:"partial",unavailable:["Parking occupancy"],stale:true,asOf:"2026-10-06T20:00:00Z"}}));
   expect(notice.getAttribute("aria-label")).toBe("Older map data");
   expect(notice.textContent).toContain("2 minutes old");
 });
});
