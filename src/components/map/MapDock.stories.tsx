import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, within } from "storybook/test";
import MapDock, { type MapDockProps } from "./MapDock";

const noop = fn();
const health = { status: "empty" as const, count: 0, source: "Public feed", timestamp: null };
const args: MapDockProps = {
    browse:{openNow:false,openNowCount:0,dealsOn:false,dealsTodayCount:0,musicTonight:false,musicTonightCount:0,timeMode:"all",timeModeExplicit:false,everythingCount:0,intentCounts:{},subCounts:{},eventWindowCounts:{}},
    placeCount:0,eventCount:0,closingSoonCount:0,placesInView:[],placesInViewOrigin:null,onPickPlaceInView:noop,
    q:"",setQ:noop,searchMatches:[],searchPending:false,searchUnavailable:false,retrySearch:noop,searchOpeningId:null,pickSearch:noop,searchDistanceOriginLabel:null,
    savedCount:0,showSavedOnly:false,setShowSavedOnly:noop,fieldNotesCount:0,fieldNotesOnly:false,setFieldNotesOnly:noop,
    amenityCount:0,amenityGroupCounts:{},communityReportCount:0,amenityGroups:new Set(),setAmenityGroups:noop,
    civicAvailable:false,showCivic:false,setShowCivic:noop,transitHealth:health,showTransit:false,setShowTransit:noop,liveBusSnapshot:null,transitAlertSnapshot:null,
    trailCount:0,showTrails:false,setShowTrails:noop,scenicRouteCount:0,showScenicRoutes:false,setShowScenicRoutes:noop,coveredBridgeCount:0,showCoveredBridges:false,setShowCoveredBridges:noop,
    aerialCount:0,showAerial:false,setShowAerial:noop,aerialSeasons:[],aerialSeason:"",onAerialSeason:noop,cemeteryCount:0,showCemeteries:false,setShowCemeteries:noop,
    parkingCount:0,providerLayersAvailable:false,mapLayerSourceHealth:undefined,retryMapLayerGroups:fn(),showParking:false,setShowParking:noop,
    showRadar:false,setShowRadar:noop,radarHealth:health,roadsNowActive:false,roadsNowFullyOn:false,setShowRoadsNow:noop,showTraffic:false,setShowTraffic:noop,
    floodContextCount:0,snowRouteCount:0,radarFrameEpoch:null,showIncidents:false,setShowIncidents:noop,incidentHealth:health,showRotorcraft:false,setShowRotorcraft:noop,showCameras:false,setShowCameras:noop,cameraHealth:health,
    activeOverlays:[],toggleOverlay:noop,scrubHour:null,setScrubHour:noop,userLoc:null,showLocationIntro:false,dismissLocationIntro:noop,locating:false,geoMsg:null,goNearMe:noop,flyTo:noop,fitCounty:noop,shareCameraParam:()=>null,
    discoveries:[],selectedDiscoveryId:null,onSelectDiscovery:noop,onPaneOpenChange:noop,radiusScenes:[],activeRadiusSceneId:null,onRadiusScene:noop,onExitRadiusScene:noop,
  };
const meta = {
  title: "Map/Search return control",
  component: MapDock,
  args,
  parameters: { layout: "fullscreen", nextjs: { navigation: { pathname: "/map", query: { returnTo: "/search?q=coffee&in=brunswick" } } } },
  decorators: [(Story) => <div data-app-primary-tab="/map" className="relative h-[620px] w-full"><Story /></div>],
} satisfies Meta<typeof MapDock>;
export default meta;
type Story = StoryObj<typeof meta>;
export const SearchReturnAt390: Story = {
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
  play: async ({ canvasElement }) => {
    const link = await within(canvasElement).findByRole("link", { name: "Back to search results" });
    await expect(link).toHaveAttribute("href", "/search?q=coffee&in=brunswick");
    await expect(link.style.color).toBe("var(--app-link)");
    await expect(link.style.background).toBe("var(--app-bg-elevated-solid)");
    await expect(link.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
  },
};
