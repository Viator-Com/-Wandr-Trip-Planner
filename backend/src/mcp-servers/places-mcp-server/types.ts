// =======================
// GeoJSON (List endpoints)
// =======================

export interface GeoJSONFeatureCollection {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
}

export interface GeoJSONFeature {
  type: "Feature";
  id: string;
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
  properties: {
    xid: string;
    name: string;
    dist?: number;
    rate?: number;
    osm?: string;
    wikidata?: string;
    kinds: string;
  };
}

// =======================
// OpenTripMap Places (Radius / Search)
// =======================

export interface OpenTripMapPlace {
  xid: string;
  name: string;
  dist?: number;
  kinds: string;
  point: {
    lon: number;
    lat: number;
  };
  osm?: string;
  wikidata?: string;
}

// =======================
// OpenTripMap Place Details
// =======================

export interface PlaceDetails {
  xid: string;
  name: string;
  rate: number; // 1–7 tourist rating
  kinds: string;

  address?: {
    road?: string;
    city?: string;
    state?: string;
    country?: string;
    postcode?: string;
  };

  sources: {
    geometry: string;
    attributes: string[];
  };

  otm?: string;
  wikipedia?: string;
  image?: string;

  preview?: {
    source: string;
    height: number;
    width: number;
  };

  wikipedia_extracts?: {
    title: string;
    text: string;
    html: string;
  };

  point: {
    lon: number;
    lat: number;
  };
}

// =======================
// Normalized Destination
// =======================

export interface Destination {
  id: string;
  name: string;
  description?: string;
  location: {
    latitude: number;
    longitude: number;
  };
  category: string[];
  rating?: number;
  image?: string;
  distance?: number;
}

export interface SearchDestinationsParams {
  query: string;
  limit?: number;
}

export interface GetPlaceDetailsParams {
  placeId: string;
}

export interface GetNearbyAttractionsParams {
  latitude: number;
  longitude: number;
  radius: number;
  limit?: number;
  kinds?: string;
}

// ─── Address component (Google Geocoding API) ─────────────────────────────────

export interface AddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

// ─── Bounding box ─────────────────────────────────────────────────────────────

export interface BoundingBox {
  lon1: number;
  lat1: number;
  lon2: number;
  lat2: number;
}

// ─── Legacy Geoapify place (kept for any existing callers) ────────────────────

export interface GeoapifyPlace {
  place_id: string;
  name?: string;
  categories: string[];
  address: Record<string, string>;
  lat: number;
  lon: number;
  distance?: number;
  contact?: Record<string, string>;
  opening_hours?: string;
  website?: string;
  datasource?: { sourcename: string; attribution: string; url?: string };
}

// ─── Google Place (Places API New) ───────────────────────────────────────────

export interface GooglePlacePhoto {
  name: string;
  width?: number;
  height?: number;
}

export interface GooglePlace {
  place_id: string;
  name?: string;
  categories: string[];
  address: {
    formatted: string;
    components?: AddressComponent[];
  };
  lat: number;
  lon: number;
  distance?: number;
  contact?: {
    phone?: string;
  };
  opening_hours?: {
    openNow?: boolean;
    periods?: unknown[];
    weekdayDescriptions?: string[];
  };
  website?: string;
  rating?: number;
  user_rating_count?: number;
  price_level?: string;
  business_status?: string;
  google_maps_uri?: string;
  editorial_summary?: string;
  primary_type?: string;
}

// ─── Geocode result ───────────────────────────────────────────────────────────

export interface GeocodeResult {
  place_id: string;
  formatted: string;
  lat: number;
  lon: number;
  /** Raw address — either Google AddressComponent[] or a key/value map */
  address: AddressComponent[] | Record<string, string>;
  /** Empty object is valid — rank metadata is optional */
  rank: Partial<{ confidence: number; match_type: string }>;
  /**
   * Viewport bounding box.
   * Stored as a 4-tuple [lon_sw, lat_sw, lon_ne, lat_ne] from Google,
   * or as a named object from Geoapify.
   */
  bbox?: BoundingBox | [number, number, number, number];
  result_type: string;
}

// ─── Route types ──────────────────────────────────────────────────────────────

export interface RouteStep {
  instruction: string;
  distance: number;
  duration: number;
  name?: string;
}

export interface RouteResult {
  distance: number; // metres
  time: number; // seconds
  legs: {
    distance: number;
    duration: number;
    steps: RouteStep[];
  }[];
  geometry?: string; // encoded polyline or Routes API polyline object
}

export interface IsolineResult {
  type: string;
  features: {
    type: string;
    geometry: { type: string; coordinates: number[][][] };
    properties: { range: number; mode: string };
  }[];
}

// ─── Autocomplete ─────────────────────────────────────────────────────────────

export interface AutocompleteResult {
  place_id: string;
  formatted: string;
  lat: number;
  lon: number;
  address: AddressComponent[] | Record<string, string>;
  result_type: string;
}

// ─── Place details result (Google Places API New) ─────────────────────────────

export interface WikiAndMedia {
  editorial_summary?: string;
  photos?: GooglePlacePhoto[];
  google_maps_uri?: string;
  wikipedia?: string;
  image?: string;
}

export interface PlaceDetailsResult {
  place_id: string;
  name?: string;
  categories: string[];
  address: {
    formatted: string;
    components?: AddressComponent[];
  };
  lat: number;
  lon: number;
  geometry?: {
    type: string;
    coordinates: number[] | number[][] | number[][][];
  };
  contact?: {
    phone?: string;
  };
  opening_hours?: {
    openNow?: boolean;
    periods?: unknown[];
    weekdayDescriptions?: string[];
  };
  website?: string;
  /** Unified media/wiki block — covers both Google and legacy Geoapify fields */
  wiki_and_media?: WikiAndMedia;
  /** Geoapify-only — area in m² */
  area?: number;
  /** Geoapify-only — surrounding places */
  surrounding?: GeoapifyPlace[];
  // Google-specific extras
  rating?: number;
  user_rating_count?: number;
  price_level?: string;
  business_status?: string;
  primary_type?: string;
  accessibility_options?: Record<string, boolean>;
  payment_options?: Record<string, boolean>;
  parking_options?: Record<string, boolean>;
}

// ─── Params ───────────────────────────────────────────────────────────────────

export interface SearchPlacesParams {
  query: string;
  category?: string;
  limit?: number;
}

export interface NearbyPlacesParams {
  lat: number;
  lon: number;
  category?: string;
  radius?: number; // metres — max 50 000
  limit?: number;
}

export interface PlaceDetailsParams {
  id?: string;
  lat?: number;
  lon?: number;
  features?: string[];
  lang?: string;
}

export interface RouteParams {
  waypoints: { lat: number; lon: number }[];
  mode: "drive" | "walk" | "bicycle" | "transit" | "bus" | "truckhazmat";
  units?: "metric" | "imperial";
  lang?: string;
  details?: string[];
}

export interface IsolineParams {
  lat: number;
  lon: number;
  mode: "drive" | "walk" | "bicycle" | "transit" | "bus";
  type: "time" | "distance";
  range: number;
  traffic?: "free_flow" | "approximated";
}

export interface AutocompleteParams {
  text: string;
  bias?: { lat: number; lon: number };
  filter?: {
    countrycode?: string;
    rect?: BoundingBox;
  };
  limit?: number;
  lang?: string;
  type?:
    | "city"
    | "street"
    | "amenity"
    | "postcode"
    | "locality"
    | "district"
    | "county"
    | "state"
    | "country"
    | "geocode"
    | "address"
    | "establishment"
    | "sublocality"
    | "postal_code"
    | "administrative_area_level_1"
    | "administrative_area_level_2";
}
