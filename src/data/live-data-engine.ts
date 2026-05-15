/**
 * FREDERICK RADIUS // LIVE DATA ENGINE
 * Real-time data from public APIs — no keys required
 * Complements the static city-data-engine with live feeds
 */

// ===== TYPES =====

export interface WeatherPeriod {
  name: string;
  temperature: number;
  temperatureUnit: string;
  windSpeed: string;
  windDirection: string;
  shortForecast: string;
  detailedForecast: string;
  isDaytime: boolean;
  icon: string;
}

export interface WeatherForecast {
  current: WeatherPeriod | null;
  periods: WeatherPeriod[];
  updatedAt: string;
}

export interface WeatherAlert {
  id: string;
  event: string;
  severity: 'Extreme' | 'Severe' | 'Moderate' | 'Minor' | 'Unknown';
  headline: string;
  description: string;
  onset: string;
  expires: string;
  senderName: string;
}

export interface GISFeature {
  id: string | number;
  geometry: {
    type: string;
    coordinates: number[] | number[][] | number[][][];
  };
  properties: Record<string, unknown>;
}

export interface TransitStop {
  id: string | number;
  name: string;
  lat: number;
  lng: number;
  routes: string[];
}

export interface TrafficIncident {
  id: string;
  description: string;
  lat: number;
  lng: number;
  severity: string;
  roadway: string;
  reportedAt: string;
}

export interface CraftBeverageEstablishment {
  id: string;
  name: string;
  type: 'brewery' | 'winery' | 'distillery' | 'meadery' | 'cidery';
  lat: number;
  lng: number;
  address: string;
  website?: string;
  description?: string;
}

export interface Trail {
  id: string;
  name: string;
  distance: number;
  difficulty: 'easy' | 'moderate' | 'difficult';
  trailhead: { lat: number; lng: number };
  description: string;
}

export interface LiveStats {
  weather: WeatherForecast | null;
  activeAlerts: number;
  trafficIncidents: number;
  population: number;
  businesses: number;
  craftBeverages: number;
  trails: number;
  totalTrailMiles: number;
}

// ===== CACHE =====

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() - entry.timestamp > entry.ttl) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache<T>(key: string, data: T, ttlMs: number): void {
  cache.set(key, { data, timestamp: Date.now(), ttl: ttlMs });
}

const TTL = {
  WEATHER: 15 * 60 * 1000,      // 15 minutes
  ALERTS: 5 * 60 * 1000,        // 5 minutes
  GIS: 60 * 60 * 1000,          // 1 hour
  TRAFFIC: 3 * 60 * 1000,       // 3 minutes
  TRANSIT: 30 * 60 * 1000,      // 30 minutes
} as const;

// ===== NWS WEATHER (Free, no key) =====

export async function fetchLiveWeather(): Promise<WeatherForecast | null> {
  const cacheKey = 'weather:forecast';
  const cached = getCached<WeatherForecast>(cacheKey);
  if (cached) return cached;

  try {
    // Frederick, MD gridpoint: LWX office, grid 80,93
    const res = await fetch('https://api.weather.gov/gridpoints/LWX/80,93/forecast', {
      headers: { 'User-Agent': 'FrederickRadius/1.0 (contact@frederickradius.com)' },
    });
    if (!res.ok) throw new Error(`NWS API ${res.status}`);

    const data = await res.json();
    const periods: WeatherPeriod[] = (data.properties?.periods ?? []).slice(0, 7).map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (p: any) => ({
        name: p.name,
        temperature: p.temperature,
        temperatureUnit: p.temperatureUnit,
        windSpeed: p.windSpeed,
        windDirection: p.windDirection,
        shortForecast: p.shortForecast,
        detailedForecast: p.detailedForecast,
        isDaytime: p.isDaytime,
        icon: p.icon,
      })
    );

    const result: WeatherForecast = {
      current: periods[0] ?? null,
      periods,
      updatedAt: new Date().toISOString(),
    };

    setCache(cacheKey, result, TTL.WEATHER);
    return result;
  } catch (err) {
    console.warn('[LiveData] Weather fetch failed:', err);
    return null;
  }
}

export async function fetchWeatherAlerts(): Promise<WeatherAlert[]> {
  const cacheKey = 'weather:alerts';
  const cached = getCached<WeatherAlert[]>(cacheKey);
  if (cached) return cached;

  try {
    // MDZ004 = Frederick County, MD forecast zone
    const res = await fetch('https://api.weather.gov/alerts/active?zone=MDZ004', {
      headers: { 'User-Agent': 'FrederickRadius/1.0 (contact@frederickradius.com)' },
    });
    if (!res.ok) throw new Error(`NWS Alerts API ${res.status}`);

    const data = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const alerts: WeatherAlert[] = (data.features ?? []).map((f: any) => ({
      id: f.properties?.id ?? f.id,
      event: f.properties?.event ?? 'Unknown',
      severity: f.properties?.severity ?? 'Unknown',
      headline: f.properties?.headline ?? '',
      description: f.properties?.description ?? '',
      onset: f.properties?.onset ?? '',
      expires: f.properties?.expires ?? '',
      senderName: f.properties?.senderName ?? '',
    }));

    setCache(cacheKey, alerts, TTL.ALERTS);
    return alerts;
  } catch (err) {
    console.warn('[LiveData] Weather alerts fetch failed:', err);
    return [];
  }
}

// ===== ARCGIS GIS DATA (Free, no key) =====

const ARCGIS_BASE = 'https://services1.arcgis.com/pMB3QMKN2mLgoYuJ/arcgis/rest/services';

async function fetchArcGISFeatures(serviceUrl: string, cacheKey: string): Promise<GISFeature[]> {
  const cached = getCached<GISFeature[]>(cacheKey);
  if (cached) return cached;

  try {
    const url = `${serviceUrl}/query?where=1%3D1&outFields=*&f=geojson&resultRecordCount=500`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`ArcGIS API ${res.status}`);

    const data = await res.json();
    const features: GISFeature[] = (data.features ?? []).map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (f: any) => ({
        id: f.id ?? f.properties?.OBJECTID ?? Math.random(),
        geometry: f.geometry,
        properties: f.properties ?? {},
      })
    );

    setCache(cacheKey, features, TTL.GIS);
    return features;
  } catch (err) {
    console.warn(`[LiveData] ArcGIS fetch failed for ${cacheKey}:`, err);
    return [];
  }
}

export async function fetchMunicipalBoundaries(): Promise<GISFeature[]> {
  return fetchArcGISFeatures(
    `${ARCGIS_BASE}/Municipal_Boundaries/FeatureServer/0`,
    'gis:municipalities'
  );
}

export async function fetchParksGIS(): Promise<GISFeature[]> {
  return fetchArcGISFeatures(
    `${ARCGIS_BASE}/Parks/FeatureServer/0`,
    'gis:parks'
  );
}

export async function fetchTransitStops(): Promise<TransitStop[]> {
  const cacheKey = 'gis:transit-stops';
  const cached = getCached<TransitStop[]>(cacheKey);
  if (cached) return cached;

  try {
    const url = `${ARCGIS_BASE}/Frederick_County_TransIT_Stops/FeatureServer/0/query?where=1%3D1&outFields=*&f=json&resultRecordCount=500`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`ArcGIS TransIT API ${res.status}`);

    const data = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stops: TransitStop[] = (data.features ?? []).map((f: any) => ({
      id: f.attributes?.OBJECTID ?? Math.random(),
      name: f.attributes?.Stop_Name ?? f.attributes?.NAME ?? 'Unknown Stop',
      lat: f.geometry?.y ?? 0,
      lng: f.geometry?.x ?? 0,
      routes: (f.attributes?.Routes ?? '').split(',').map((r: string) => r.trim()).filter(Boolean),
    }));

    setCache(cacheKey, stops, TTL.TRANSIT);
    return stops;
  } catch (err) {
    console.warn('[LiveData] Transit stops fetch failed:', err);
    return [];
  }
}

// ===== MARYLAND CHART TRAFFIC (Free, no key) =====

// Frederick County bounding box
const FREDERICK_BOUNDS = {
  minLat: 39.19,
  maxLat: 39.72,
  minLng: -77.68,
  maxLng: -77.16,
} as const;

export async function fetchTrafficIncidents(): Promise<TrafficIncident[]> {
  const cacheKey = 'traffic:incidents';
  const cached = getCached<TrafficIncident[]>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch('https://chart.maryland.gov/atms/api/incidents');
    if (!res.ok) throw new Error(`CHART API ${res.status}`);

    const data = await res.json();
     
    const incidents: TrafficIncident[] = (Array.isArray(data) ? data : [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((inc: any) => {
        const lat = parseFloat(inc.latitude ?? inc.lat ?? 0);
        const lng = parseFloat(inc.longitude ?? inc.lng ?? 0);
        return (
          lat >= FREDERICK_BOUNDS.minLat &&
          lat <= FREDERICK_BOUNDS.maxLat &&
          lng >= FREDERICK_BOUNDS.minLng &&
          lng <= FREDERICK_BOUNDS.maxLng
        );
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((inc: any) => ({
        id: inc.id ?? String(Math.random()),
        description: inc.description ?? inc.title ?? 'Traffic Incident',
        lat: parseFloat(inc.latitude ?? inc.lat ?? 0),
        lng: parseFloat(inc.longitude ?? inc.lng ?? 0),
        severity: inc.severity ?? 'Unknown',
        roadway: inc.roadway ?? inc.road ?? 'Unknown',
        reportedAt: inc.reportedAt ?? inc.created ?? new Date().toISOString(),
      }));

    setCache(cacheKey, incidents, TTL.TRAFFIC);
    return incidents;
  } catch (err) {
    console.warn('[LiveData] Traffic incidents fetch failed:', err);
    return [];
  }
}

// ===== CRAFT BEVERAGE TRAIL DATA =====

export const CRAFT_BEVERAGE_TRAIL: CraftBeverageEstablishment[] = [
  // Breweries
  { id: 'flying-dog', name: 'Flying Dog Brewery', type: 'brewery', lat: 39.4081, lng: -77.4209, address: '4607 Wedgewood Blvd, Frederick', website: 'flyingdog.com', description: "Maryland's largest craft brewery" },
  { id: 'attaboy', name: 'Attaboy Beer', type: 'brewery', lat: 39.4125, lng: -77.4088, address: '329 N Market St, Frederick', website: 'attaboybeer.com' },
  { id: 'smoketown', name: 'Smoketown Brewing Station', type: 'brewery', lat: 39.3125, lng: -77.6278, address: '223 W Potomac St, Brunswick', website: 'smoketownbrewing.com' },
  { id: 'idiom', name: 'Idiom Brewing', type: 'brewery', lat: 39.4160, lng: -77.4110, address: '24 N Market St, Frederick', website: 'idiombrewing.com' },
  { id: 'olde-mother', name: 'Olde Mother Brewing', type: 'brewery', lat: 39.4148, lng: -77.4095, address: '526 N Market St, Frederick', website: 'oldemotherbrewing.com' },
  { id: 'red-shedman', name: 'Red Shedman Farm Brewery', type: 'brewery', lat: 39.4570, lng: -77.5420, address: '12840 Spickler Rd, Clear Spring', website: 'redshedman.com' },
  { id: 'steinhardt', name: 'Steinhardt Brewing', type: 'brewery', lat: 39.4160, lng: -77.4100, address: '100 N East St, Frederick', website: 'steinhardtbrewing.com' },
  { id: 'milkhouse', name: 'Milkhouse Brewery at Stillpoint Farm', type: 'brewery', lat: 39.3750, lng: -77.2850, address: '8253 Dollyhyde Rd, Mt Airy', website: 'milkhousebrewery.com' },
  { id: 'rocket-frog', name: 'Rocket Frog Brewing', type: 'brewery', lat: 39.4135, lng: -77.4098, address: '540 N Market St, Frederick', website: 'rocketfrogbrewing.com' },
  { id: 'monocacy', name: 'Monocacy Brewing', type: 'brewery', lat: 39.4100, lng: -77.4050, address: '1781 N Market St, Frederick', website: 'monocacybrewing.com' },
  { id: 'midnight-run', name: 'Midnight Run Brewing', type: 'brewery', lat: 39.3810, lng: -77.3760, address: '4940 Waterfront Dr, Frederick' },
  { id: 'barley-hops', name: 'Barley & Hops Brewery', type: 'brewery', lat: 39.4155, lng: -77.4092, address: '5473 Urban Pike, Frederick', website: 'barleyandhopsbrewery.com' },
  { id: 'jailbreak', name: 'Jailbreak Brewing (Tap Room)', type: 'brewery', lat: 39.4130, lng: -77.4085, address: 'N Market St, Frederick' },
  { id: 'waredaca', name: 'Waredaca Brewing', type: 'brewery', lat: 39.2950, lng: -77.2350, address: 'Laytonsville area', website: 'waredacabrewing.com' },

  // Wineries
  { id: 'linganore', name: 'Linganore Winecellars', type: 'winery', lat: 39.3780, lng: -77.3050, address: '13601 Glissans Mill Rd, Mt Airy', website: 'linganorewines.com', description: "One of Maryland's oldest and largest wineries" },
  { id: 'elk-run', name: 'Elk Run Vineyards', type: 'winery', lat: 39.3890, lng: -77.2800, address: '15113 Liberty Rd, Mt Airy', website: 'elkrun.com' },
  { id: 'loew', name: 'Loew Vineyards', type: 'winery', lat: 39.3700, lng: -77.2600, address: '14001 Liberty Rd, Mt Airy', website: 'loewvineyards.com' },
  { id: 'black-ankle', name: 'Black Ankle Vineyards', type: 'winery', lat: 39.3600, lng: -77.2500, address: '14463 Black Ankle Rd, Mt Airy', website: 'blackankle.com' },
  { id: 'springfield-manor', name: 'Springfield Manor Winery & Distillery', type: 'winery', lat: 39.5900, lng: -77.4200, address: '11836 Auburn Rd, Thurmont', website: 'springfieldmanor.com' },
  { id: 'hidden-hills', name: 'Hidden Hills Farm & Vineyard', type: 'winery', lat: 39.4800, lng: -77.5100, address: 'Middletown area' },
  { id: 'catoctin-breeze', name: 'Catoctin Breeze Vineyard', type: 'winery', lat: 39.5200, lng: -77.4500, address: '164 Stambaugh Rd, Thurmont', website: 'catoctinbreeze.com' },
  { id: 'links-bridge', name: 'Links Bridge Vineyards', type: 'winery', lat: 39.3500, lng: -77.2900, address: 'Union Bridge area', website: 'linksbridgevineyards.com' },
  { id: 'serpent-ridge', name: 'Serpent Ridge Vineyard', type: 'winery', lat: 39.5100, lng: -77.3200, address: 'Westminster area', website: 'serpentridge.com' },
  { id: 'regulars-reserve', name: "Regular's Reserve", type: 'winery', lat: 39.4600, lng: -77.4300, address: 'Frederick area' },
  { id: 'willow-oaks', name: 'Willow Oaks Craft Cider & Wine', type: 'winery', lat: 39.4400, lng: -77.4600, address: 'Middletown area' },

  // Distilleries
  { id: 'mcclintock', name: 'McClintock Distilling', type: 'distillery', lat: 39.4125, lng: -77.4090, address: '35 S Carroll St, Frederick', website: 'mcclintockdistilling.com', description: 'Craft spirits using local grain' },
  { id: 'tenth-ward', name: 'Tenth Ward Distilling', type: 'distillery', lat: 39.4140, lng: -77.4105, address: '508 E Church St, Frederick', website: 'tenthwarddistilling.com' },
  { id: 'dragon', name: 'Dragon Distillery', type: 'distillery', lat: 39.4100, lng: -77.4100, address: '101 W Patrick St, Frederick', website: 'dragondistillery.com' },
  { id: 'black-locust', name: 'Black Locust Hops & Spirits', type: 'distillery', lat: 39.4200, lng: -77.4150, address: 'Frederick area' },

  // Cideries
  { id: 'distillery-lane', name: 'Distillery Lane Ciderworks', type: 'cidery', lat: 39.3950, lng: -77.5800, address: '5533 Gap Creek Rd, Jefferson', website: 'distillerylaneciderworks.com' },
  { id: 'urban-farmhouse', name: 'Urban Farmhouse Cidery', type: 'cidery', lat: 39.4130, lng: -77.4080, address: 'Downtown Frederick' },

  // Meaderies
  { id: 'orchid-cellar', name: 'Orchid Cellar Meadery', type: 'meadery', lat: 39.4440, lng: -77.5440, address: '8546 Pete Wiles Rd, Middletown', website: 'orchidcellar.com', description: 'Award-winning meadery in the Middletown Valley' },
  { id: 'royal-meadery', name: 'Royal Meadery', type: 'meadery', lat: 39.4150, lng: -77.4100, address: 'Downtown Frederick' },
];

// ===== TRAILS DATA =====

export const FREDERICK_TRAILS: Trail[] = [
  { id: 'catoctin-trail', name: 'Catoctin Trail', distance: 28, difficulty: 'difficult', trailhead: { lat: 39.6237, lng: -77.4080 }, description: '28-mile trail through Catoctin Mountain Park and Cunningham Falls State Park' },
  { id: 'co-canal', name: 'C&O Canal Towpath', distance: 15, difficulty: 'easy', trailhead: { lat: 39.3137, lng: -77.6292 }, description: 'Historic towpath along the Potomac River through Brunswick' },
  { id: 'monocacy-battlefield', name: 'Monocacy Battlefield Trails', distance: 5, difficulty: 'easy', trailhead: { lat: 39.3773, lng: -77.3956 }, description: 'Civil War battlefield with interpretive trails' },
  { id: 'carroll-creek', name: 'Carroll Creek Linear Park', distance: 1.3, difficulty: 'easy', trailhead: { lat: 39.4120, lng: -77.4080 }, description: 'Urban waterfront trail through downtown Frederick' },
  { id: 'frederick-watershed', name: 'Frederick Watershed', distance: 90, difficulty: 'moderate', trailhead: { lat: 39.4500, lng: -77.4800 }, description: '7,800-acre municipal forest with 90 miles of trails' },
  { id: 'gambrill-state-park', name: 'Gambrill State Park', distance: 16, difficulty: 'moderate', trailhead: { lat: 39.4780, lng: -77.4920 }, description: 'Mountain trails with scenic overlooks of Frederick Valley' },
  { id: 'cunningham-falls', name: 'Cunningham Falls State Park', distance: 12, difficulty: 'moderate', trailhead: { lat: 39.6300, lng: -77.4600 }, description: "Home to Maryland's largest cascading waterfall" },
  { id: 'baker-park', name: 'Baker Park Loop', distance: 1.5, difficulty: 'easy', trailhead: { lat: 39.4180, lng: -77.4180 }, description: "Scenic loop through Frederick's premier urban park" },
  { id: 'ballenger-creek', name: 'Ballenger Creek Trail', distance: 4, difficulty: 'easy', trailhead: { lat: 39.3700, lng: -77.4100 }, description: 'Paved trail connecting neighborhoods in south Frederick' },
  { id: 'sugarloaf-mountain', name: 'Sugarloaf Mountain', distance: 7, difficulty: 'moderate', trailhead: { lat: 39.2520, lng: -77.3950 }, description: 'Iconic monadnock with panoramic views of the Piedmont' },
];

// ===== AGGREGATED STATS =====

export async function fetchLiveStats(): Promise<LiveStats> {
  const cacheKey = 'stats:live';
  const cached = getCached<LiveStats>(cacheKey);
  if (cached) return cached;

  const [weather, alerts, traffic] = await Promise.allSettled([
    fetchLiveWeather(),
    fetchWeatherAlerts(),
    fetchTrafficIncidents(),
  ]);

  const totalTrailMiles = FREDERICK_TRAILS.reduce((sum, t) => sum + t.distance, 0);

  const stats: LiveStats = {
    weather: weather.status === 'fulfilled' ? weather.value : null,
    activeAlerts: alerts.status === 'fulfilled' ? alerts.value.length : 0,
    trafficIncidents: traffic.status === 'fulfilled' ? traffic.value.length : 0,
    population: 305000,
    businesses: 4500,
    craftBeverages: CRAFT_BEVERAGE_TRAIL.length,
    trails: FREDERICK_TRAILS.length,
    totalTrailMiles,
  };

  setCache(cacheKey, stats, TTL.TRAFFIC); // short TTL since it includes traffic
  return stats;
}

// ===== UTILITY: Clear cache =====

export function clearLiveDataCache(): void {
  cache.clear();
}

export function getCacheSize(): number {
  return cache.size;
}
