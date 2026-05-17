import axios, { AxiosInstance } from "axios";

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.resolve(__dirname, "../../../.env"),
});

import type {
  GeocodeResult,
  GooglePlace,
  AutocompleteParams,
  AutocompleteResult,
  NearbyPlacesParams,
  PlaceDetailsParams,
  PlaceDetailsResult,
  RouteParams,
  RouteResult,
} from "./types.js";

// ─── API error ────────────────────────────────────────────────────────────────

export class GooglePlacesError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "GooglePlacesError";
  }
}

// ─── Field masks ──────────────────────────────────────────────────────────────

const PLACE_BASIC_FIELDS =
  "places.id,places.displayName,places.formattedAddress,places.location," +
  "places.types,places.regularOpeningHours,places.internationalPhoneNumber," +
  "places.websiteUri,places.rating,places.userRatingCount,places.primaryType";

const PLACE_DETAIL_FIELDS =
  "id,displayName,formattedAddress,location,types,regularOpeningHours," +
  "internationalPhoneNumber,websiteUri,rating,userRatingCount,primaryType," +
  "editorialSummary,photos,accessibilityOptions,paymentOptions,parkingOptions," +
  "priceLevel,currentOpeningHours,nationalPhoneNumber,addressComponents," +
  "businessStatus,googleMapsUri,iconMaskBaseUri,iconBackgroundColor";

// ─── Service ──────────────────────────────────────────────────────────────────

class GooglePlacesAPI {
  private readonly client: AxiosInstance;
  private readonly geocodeClient: AxiosInstance;
  private readonly apiKey: string;

  constructor() {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;

    if (!apiKey)
      throw new GooglePlacesError("GOOGLE_PLACES_API_KEY must be set");

    this.apiKey = apiKey;

    // Places API (New) — v1
    this.client = axios.create({
      baseURL: "https://places.googleapis.com/v1",
      timeout: 15_000,
      headers: { "X-Goog-Api-Key": apiKey, "Content-Type": "application/json" },
    });

    // Geocoding API — separate base URL
    this.geocodeClient = axios.create({
      baseURL: "https://maps.googleapis.com/maps/api",
      timeout: 15_000,
    });
  }

  // ── Shared error handler ────────────────────────────────────────────────────

  private handleError(err: any, context: string): never {
    const status = err?.response?.status;
    const message =
      err?.response?.data?.error?.message ??
      err?.response?.data?.message ??
      err?.message ??
      "Unknown error";

    if (status === 401 || status === 403)
      throw new GooglePlacesError(
        `Authentication failed – check GOOGLE_PLACES_API_KEY`,
        status,
        "AUTH_ERROR",
      );
    if (status === 429)
      throw new GooglePlacesError(
        `Rate limit exceeded`,
        status,
        "RATE_LIMITED",
      );
    if (status != null && status >= 500)
      throw new GooglePlacesError(
        `Google server error: ${message}`,
        status,
        "SERVER_ERROR",
      );

    throw new GooglePlacesError(`${context} failed: ${message}`, status);
  }

  // ── Map a Google Place feature to our shared shape ──────────────────────────

  private mapPlace(p: any, distance?: number): GooglePlace {
    return {
      place_id: p.id ?? "",
      name: p.displayName?.text ?? p.displayName ?? "",
      categories: p.types ?? [],
      address: {
        formatted: p.formattedAddress ?? "",
        components: p.addressComponents ?? [],
      },
      lat: p.location?.latitude ?? 0,
      lon: p.location?.longitude ?? 0,
      distance,
      contact: {
        phone: p.internationalPhoneNumber ?? p.nationalPhoneNumber,
      },
      opening_hours: p.regularOpeningHours ?? p.currentOpeningHours,
      website: p.websiteUri,
      rating: p.rating,
      user_rating_count: p.userRatingCount,
      price_level: p.priceLevel,
      business_status: p.businessStatus,
      google_maps_uri: p.googleMapsUri,
      editorial_summary: p.editorialSummary?.text,
      primary_type: p.primaryType,
    };
  }

  // ── Geocode address → coordinates ───────────────────────────────────────────

  async geocode(
    address: string,
    lang = "en",
    limit = 5,
  ): Promise<GeocodeResult[]> {
    try {
      const res = await this.geocodeClient.get("/geocode/json", {
        params: { address, key: this.apiKey, language: lang },
      });

      if (res.data.status !== "OK" && res.data.status !== "ZERO_RESULTS") {
        throw new GooglePlacesError(
          `Geocoding failed: ${res.data.status} – ${res.data.error_message ?? ""}`,
        );
      }

      return (res.data.results ?? []).slice(0, limit).map((r: any) => ({
        place_id: r.place_id,
        formatted: r.formatted_address,
        lat: r.geometry.location.lat,
        lon: r.geometry.location.lng,
        address: r.address_components,
        rank: {},
        bbox: r.geometry.viewport
          ? [
              r.geometry.viewport.southwest.lng,
              r.geometry.viewport.southwest.lat,
              r.geometry.viewport.northeast.lng,
              r.geometry.viewport.northeast.lat,
            ]
          : undefined,
        result_type: (r.types ?? []).join(","),
      }));
    } catch (err) {
      if (err instanceof GooglePlacesError) throw err;
      this.handleError(err, "Geocode");
    }
  }

  // ── Reverse geocode: coordinates → address ──────────────────────────────────

  async reverseGeocode(
    lat: number,
    lon: number,
    lang = "en",
  ): Promise<GeocodeResult | null> {
    try {
      const res = await this.geocodeClient.get("/geocode/json", {
        params: { latlng: `${lat},${lon}`, key: this.apiKey, language: lang },
      });

      if (res.data.status !== "OK") return null;

      const r = res.data.results?.[0];
      if (!r) return null;

      return {
        place_id: r.place_id,
        formatted: r.formatted_address,
        lat: r.geometry.location.lat,
        lon: r.geometry.location.lng,
        address: r.address_components,
        rank: {},
        bbox: r.geometry.viewport
          ? [
              r.geometry.viewport.southwest.lng,
              r.geometry.viewport.southwest.lat,
              r.geometry.viewport.northeast.lng,
              r.geometry.viewport.northeast.lat,
            ]
          : undefined,
        result_type: (r.types ?? []).join(","),
      };
    } catch (err) {
      this.handleError(err, "Reverse geocode");
    }
  }

  // ── Autocomplete ────────────────────────────────────────────────────────────

  async autocomplete(
    params: AutocompleteParams,
  ): Promise<AutocompleteResult[]> {
    try {
      const body: Record<string, any> = {
        input: params.text,
        languageCode: params.lang ?? "en",
      };

      if (params.limit) body.pageSize = params.limit;

      if (params.bias?.lat) {
        body.locationBias = {
          circle: {
            center: { latitude: params.bias.lat, longitude: params.bias.lon },
            radius: 50_000,
          },
        };
      }

      if (params.filter?.countrycode) {
        body.includedRegionCodes = [params.filter.countrycode];
      }

      if (params.type) {
        body.includedPrimaryTypes = [params.type];
      }

      const res = await this.client.post("/places:autocomplete", body);

      return (res.data.suggestions ?? []).map((s: any) => {
        const pred = s.placePrediction;
        return {
          place_id: pred?.placeId ?? "",
          formatted: pred?.text?.text ?? "",
          lat: 0, // autocomplete doesn't return coords; fetch via getPlaceDetails if needed
          lon: 0,
          address: { formatted: pred?.text?.text ?? "" },
          result_type: (pred?.types ?? []).join(","),
        };
      });
    } catch (err) {
      this.handleError(err, "Autocomplete");
    }
  }

  // ── Search places by name / category ────────────────────────────────────────

  async searchPlaces(
    query: string,
    category?: string,
    limit = 10,
  ): Promise<GooglePlace[]> {
    try {
      const body: Record<string, any> = {
        textQuery: query,
        languageCode: "en",
        pageSize: Math.min(limit, 20),
      };

      if (category) body.includedType = category;

      const res = await this.client.post("/places:searchText", body, {
        headers: { "X-Goog-FieldMask": PLACE_BASIC_FIELDS },
      });

      return (res.data.places ?? []).map((p: any) => this.mapPlace(p));
    } catch (err) {
      this.handleError(err, "Search places");
    }
  }

  // ── Nearby places by coordinates ────────────────────────────────────────────

  async nearbyPlaces(params: NearbyPlacesParams): Promise<GooglePlace[]> {
    try {
      const { lat, lon, category, radius = 5_000, limit = 20 } = params;

      const body: Record<string, any> = {
        locationRestriction: {
          circle: {
            center: { latitude: lat, longitude: lon },
            radius,
          },
        },
        languageCode: "en",
        maxResultCount: Math.min(limit, 20),
        rankPreference: "DISTANCE",
      };

      if (category) body.includedTypes = [category];

      const res = await this.client.post("/places:searchNearby", body, {
        headers: { "X-Goog-FieldMask": PLACE_BASIC_FIELDS },
      });

      // Approximate distance from centre (API doesn't return it directly)
      const originLat = lat * (Math.PI / 180);
      const originLon = lon * (Math.PI / 180);

      return (res.data.places ?? []).map((p: any) => {
        const pLat = (p.location?.latitude ?? 0) * (Math.PI / 180);
        const pLon = (p.location?.longitude ?? 0) * (Math.PI / 180);
        const dLat = pLat - originLat;
        const dLon = pLon - originLon;
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos(originLat) * Math.cos(pLat) * Math.sin(dLon / 2) ** 2;
        const distance = Math.round(
          6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)),
        );
        return this.mapPlace(p, distance);
      });
    } catch (err) {
      this.handleError(err, "Nearby places");
    }
  }

  // ── Place details ───────────────────────────────────────────────────────────

  async getPlaceDetails(
    params: PlaceDetailsParams,
  ): Promise<PlaceDetailsResult | null> {
    try {
      let placeId: string;

      if (params.id) {
        placeId = params.id;
      } else {
        // Resolve coords → place_id via reverse geocode
        const geo = await this.reverseGeocode(params.lat!, params.lon!);
        if (!geo) return null;
        placeId = geo.place_id;
      }

      const res = await this.client.get(`/places/${placeId}`, {
        params: { languageCode: params.lang ?? "en" },
        headers: { "X-Goog-FieldMask": PLACE_DETAIL_FIELDS },
      });

      const p = res.data;
      if (!p) return null;

      return {
        place_id: p.id ?? "",
        name: p.displayName?.text ?? "",
        categories: p.types ?? [],
        address: {
          formatted: p.formattedAddress ?? "",
          components: p.addressComponents ?? [],
        },
        lat: p.location?.latitude ?? 0,
        lon: p.location?.longitude ?? 0,
        geometry: {
          type: "Point",
          coordinates: [p.location?.longitude ?? 0, p.location?.latitude ?? 0],
        },
        contact: { phone: p.internationalPhoneNumber ?? p.nationalPhoneNumber },
        opening_hours: p.regularOpeningHours ?? p.currentOpeningHours,
        website: p.websiteUri,
        wiki_and_media: {
          editorial_summary: p.editorialSummary?.text,
          photos: (p.photos ?? []).map((ph: any) => ({
            name: ph.name,
            width: ph.widthPx,
            height: ph.heightPx,
          })),
          google_maps_uri: p.googleMapsUri,
        },
        rating: p.rating,
        user_rating_count: p.userRatingCount,
        price_level: p.priceLevel,
        business_status: p.businessStatus,
        primary_type: p.primaryType,
        accessibility_options: p.accessibilityOptions,
        payment_options: p.paymentOptions,
        parking_options: p.parkingOptions,
      };
    } catch (err) {
      this.handleError(err, "Place details");
    }
  }

  // ── Routing (Directions API — unchanged base, still REST) ───────────────────

  async getRoute(params: RouteParams): Promise<RouteResult> {
    try {
      // Routes API (New)
      const origin = params.waypoints[0];
      const destination = params.waypoints[params.waypoints.length - 1];
      const intermediates = params.waypoints.slice(1, -1).map((w) => ({
        location: { latLng: { latitude: w.lat, longitude: w.lon } },
      }));

      const modeMap: Record<string, string> = {
        drive: "DRIVE",
        walk: "WALK",
        bicycle: "BICYCLE",
        transit: "TRANSIT",
        bus: "TRANSIT",
        truckhazmat: "DRIVE",
      };

      const body: Record<string, any> = {
        origin: {
          location: { latLng: { latitude: origin.lat, longitude: origin.lon } },
        },
        destination: {
          location: {
            latLng: { latitude: destination.lat, longitude: destination.lon },
          },
        },
        travelMode: modeMap[params.mode] ?? "DRIVE",
        languageCode: params.lang ?? "en",
        units: (params.units ?? "metric") === "metric" ? "METRIC" : "IMPERIAL",
        computeAlternativeRoutes: false,
      };

      if (intermediates.length) body.intermediates = intermediates;

      const routesClient = axios.create({
        baseURL: "https://routes.googleapis.com/directions/v2",
        timeout: 15_000,
        headers: {
          "X-Goog-Api-Key": this.apiKey,
          "Content-Type": "application/json",
          "X-Goog-FieldMask":
            "routes.duration,routes.distanceMeters,routes.legs,routes.polyline",
        },
      });

      const res = await routesClient.post(":computeRoutes", body);
      const route = res.data?.routes?.[0];

      if (!route)
        throw new GooglePlacesError("No route found between given waypoints");

      const durationSec = parseInt(route.duration?.replace("s", "") ?? "0", 10);

      return {
        distance: route.distanceMeters ?? 0,
        time: durationSec,
        legs: (route.legs ?? []).map((leg: any) => ({
          distance: leg.distanceMeters,
          duration: parseInt(leg.duration?.replace("s", "") ?? "0", 10),
          steps: (leg.steps ?? []).map((step: any) => ({
            instruction: step.navigationInstruction?.instructions ?? "",
            distance: step.distanceMeters,
            duration: parseInt(
              step.staticDuration?.replace("s", "") ?? "0",
              10,
            ),
          })),
        })),
        geometry: route.polyline,
      };
    } catch (err) {
      if (err instanceof GooglePlacesError) throw err;
      this.handleError(err, "Routing");
    }
  }
}

export const googlePlacesAPI = new GooglePlacesAPI();
