/**
 * FREDERICK RADIUS // API CLIENT
 * Unified client that talks to the backend server (when running)
 * or falls back to direct API calls / static data
 */

import { DEMOGRAPHICS, ECONOMY, LIFESTYLE, GEO_LAYERS, SNAPSHOT } from './city-data-engine';
import {
  fetchLiveWeather,
  fetchWeatherAlerts,
  fetchTrafficIncidents,
  fetchTransitStops,
  fetchMunicipalBoundaries,
  fetchParksGIS,
  fetchLiveStats,
  CRAFT_BEVERAGE_TRAIL,
  FREDERICK_TRAILS,
  type WeatherForecast,
  type WeatherAlert,
  type TrafficIncident,
  type TransitStop,
  type GISFeature,
  type CraftBeverageEstablishment,
  type Trail,
  type LiveStats,
} from './live-data-engine';

// ===== CONFIG =====

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

// ===== CORE FETCH HELPER =====

export async function fetchFromAPI<T>(endpoint: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) throw new Error(`API ${res.status}`);
    return await res.json();
  } catch {
    console.warn(`[API] ${endpoint} unavailable, using fallback`);
    return fallback;
  }
}

// ===== TYPES =====

export interface Municipality {
  id: string;
  name: string;
  population: number;
  lat: number;
  lng: number;
  type: string;
}

export interface Place {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category: string;
  description?: string;
}

export interface Event {
  id: string;
  name: string;
  lat: number;
  lng: number;
  frequency: string;
  attendance: number;
}

export interface Deal {
  id: string;
  businessName: string;
  description: string;
  discount: string;
  validUntil: string;
}

export interface SearchResult {
  type: 'municipality' | 'place' | 'trail' | 'craft-beverage' | 'event';
  id: string;
  name: string;
  lat: number;
  lng: number;
  description?: string;
}

export interface CountyStats {
  population: string;
  municipalities: number;
  activeBusinesses: string;
  annualImpact: string;
  parkland: string;
  annualVisitors: string;
  craftBeverages: number;
  totalTrailMiles: number;
  trails: number;
}

// ===== TYPED API FUNCTIONS =====

/**
 * Get all 12 municipalities with demographics
 */
export async function getMunicipalities(): Promise<Municipality[]> {
  const fallback: Municipality[] = DEMOGRAPHICS.municipalities.map((m) => ({
    id: m.id,
    name: m.name,
    population: m.population,
    lat: m.lat,
    lng: m.lng,
    type: m.type,
  }));
  return fetchFromAPI<Municipality[]>('/municipalities', fallback);
}

/**
 * Get places of interest (parks, developments, landmarks)
 */
export async function getPlaces(): Promise<Place[]> {
  const fallback: Place[] = [
    ...GEO_LAYERS.parks.map((p, i) => ({
      id: `park-${i}`,
      name: p.name,
      lat: p.lat,
      lng: p.lng,
      category: 'park',
      description: `${p.acres} acres - ${p.type}`,
    })),
    ...GEO_LAYERS.development.map((d, i) => ({
      id: `dev-${i}`,
      name: d.name,
      lat: d.lat,
      lng: d.lng,
      category: 'development',
      description: `${d.value} - ${d.status}`,
    })),
  ];
  return fetchFromAPI<Place[]>('/places', fallback);
}

/**
 * Get upcoming events
 */
export async function getEvents(): Promise<Event[]> {
  const fallback: Event[] = GEO_LAYERS.events.map((e, i) => ({
    id: `event-${i}`,
    name: e.name,
    lat: e.lat,
    lng: e.lng,
    frequency: e.frequency,
    attendance: e.attendance,
  }));
  return fetchFromAPI<Event[]>('/events', fallback);
}

/**
 * Get all trails with distances and difficulty
 */
export async function getTrails(): Promise<Trail[]> {
  return fetchFromAPI<Trail[]>('/trails', FREDERICK_TRAILS);
}

/**
 * Get TransIT bus stops from live GIS or backend
 */
export async function getTransit(): Promise<TransitStop[]> {
  try {
    const apiStops = await fetchFromAPI<TransitStop[] | null>('/transit', null);
    if (apiStops && apiStops.length > 0) return apiStops;
  } catch {
    // Fall through to live fetch
  }
  return fetchTransitStops();
}

/**
 * Get active weather alerts
 */
export async function getAlerts(): Promise<WeatherAlert[]> {
  try {
    const apiAlerts = await fetchFromAPI<WeatherAlert[] | null>('/alerts', null);
    if (apiAlerts && apiAlerts.length > 0) return apiAlerts;
  } catch {
    // Fall through to live fetch
  }
  return fetchWeatherAlerts();
}

/**
 * Get the craft beverage trail with all establishments
 */
export async function getCraftTrail(): Promise<CraftBeverageEstablishment[]> {
  return fetchFromAPI<CraftBeverageEstablishment[]>('/craft-trail', CRAFT_BEVERAGE_TRAIL);
}

/**
 * Get current deals and offers
 */
export async function getDeals(): Promise<Deal[]> {
  const fallback: Deal[] = [];
  return fetchFromAPI<Deal[]>('/deals', fallback);
}

/**
 * Get aggregated county stats (live + static)
 */
export async function getStats(): Promise<CountyStats> {
  const totalTrailMiles = FREDERICK_TRAILS.reduce((sum, t) => sum + t.distance, 0);
  const fallback: CountyStats = {
    population: SNAPSHOT.population,
    municipalities: SNAPSHOT.municipalities,
    activeBusinesses: SNAPSHOT.activeBusinesses,
    annualImpact: SNAPSHOT.annualImpact,
    parkland: SNAPSHOT.parkland,
    annualVisitors: SNAPSHOT.annualVisitors,
    craftBeverages: CRAFT_BEVERAGE_TRAIL.length,
    totalTrailMiles,
    trails: FREDERICK_TRAILS.length,
  };
  return fetchFromAPI<CountyStats>('/stats', fallback);
}

/**
 * Search across all data types
 */
export async function search(query: string): Promise<SearchResult[]> {
  // Try backend search first
  try {
    const apiResults = await fetchFromAPI<SearchResult[] | null>(`/search?q=${encodeURIComponent(query)}`, null);
    if (apiResults && apiResults.length > 0) return apiResults;
  } catch {
    // Fall through to local search
  }

  // Local search fallback
  const q = query.toLowerCase();
  const results: SearchResult[] = [];

  // Search municipalities
  DEMOGRAPHICS.municipalities.forEach((m) => {
    if (m.name.toLowerCase().includes(q) || m.type.toLowerCase().includes(q)) {
      results.push({ type: 'municipality', id: m.id, name: m.name, lat: m.lat, lng: m.lng, description: m.type });
    }
  });

  // Search trails
  FREDERICK_TRAILS.forEach((t) => {
    if (t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)) {
      results.push({ type: 'trail', id: t.id, name: t.name, lat: t.trailhead.lat, lng: t.trailhead.lng, description: t.description });
    }
  });

  // Search craft beverages
  CRAFT_BEVERAGE_TRAIL.forEach((c) => {
    if (c.name.toLowerCase().includes(q) || c.type.includes(q) || c.address.toLowerCase().includes(q)) {
      results.push({ type: 'craft-beverage', id: c.id, name: c.name, lat: c.lat, lng: c.lng, description: `${c.type} - ${c.address}` });
    }
  });

  // Search events
  GEO_LAYERS.events.forEach((e, i) => {
    if (e.name.toLowerCase().includes(q)) {
      results.push({ type: 'event', id: `event-${i}`, name: e.name, lat: e.lat, lng: e.lng, description: `${e.frequency} - ${e.attendance} attendees` });
    }
  });

  return results;
}

// ===== LIVE DATA PASSTHROUGH =====
// These re-export live functions for convenience when importing from api-client

export {
  fetchLiveWeather as getLiveWeather,
  fetchLiveStats as getLiveStats,
  fetchMunicipalBoundaries as getGISBoundaries,
  fetchParksGIS as getGISParks,
  fetchTrafficIncidents as getTrafficIncidents,
};

export type {
  WeatherForecast,
  WeatherAlert,
  TrafficIncident,
  TransitStop,
  GISFeature,
  CraftBeverageEstablishment,
  Trail,
  LiveStats,
};
