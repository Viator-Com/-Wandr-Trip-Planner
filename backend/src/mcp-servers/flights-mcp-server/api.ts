import axios from "axios";

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.resolve(__dirname, "../../../.env"),
});

/* ─────────────────────────────────────────────────────────────────
   Sky Scrapper  –  RapidAPI client
   Base URL: https://sky-scrapper.p.rapidapi.com/api
───────────────────────────────────────────────────────────────── */

const BASE_URL = "https://sky-scrapper.p.rapidapi.com/api";

const headers = {
  "x-rapidapi-host": "sky-scrapper.p.rapidapi.com",
  "x-rapidapi-key": process.env.RAPID_API_KEY ?? "",
};

const client = axios.create({ baseURL: BASE_URL, headers });

/* ─────────────────────────────────────────────────────────────────
   Types
───────────────────────────────────────────────────────────────── */

export interface SearchAirportParams {
  query: string; // city or airport name  e.g. "Jodhpur"
  locale?: string; // default "en-US"
}

export interface SearchFlightsV2Params {
  originSkyId: string; // e.g. "JDH"
  destinationSkyId: string; // e.g. "DEL"
  originEntityId: string; // entityId from searchAirport
  destinationEntityId: string; // entityId from searchAirport
  date: string; // YYYY-MM-DD
  returnDate?: string; // YYYY-MM-DD  (round-trip only)
  cabinClass?: "economy" | "premium_economy" | "business" | "first";
  adults?: number; // default 1
  childrens?: number; // default 0
  infants?: number; // default 0
  sortBy?:
    | "best"
    | "price_high"
    | "fastest"
    | "outbound_take_off_time"
    | "outbound_landing_time"
    | "return_take_off_time"
    | "return_landing_time";
  limit?: number; // default 10
  carriersIds?: string; // comma-separated carrier IDs
  currency?: string; // default "USD"
  market?: string; // default "en-US"
  countryCode?: string; // default "US"
}

export interface SearchFlightsMultiStopsParams {
  legs: Array<{
    originSkyId: string;
    destinationSkyId: string;
    originEntityId: string;
    destinationEntityId: string;
    date: string; // YYYY-MM-DD
  }>;
  cabinClass?: "economy" | "premium_economy" | "business" | "first";
  adults?: number;
  childrens?: number;
  infants?: number;
  currency?: string;
  market?: string;
  countryCode?: string;
}

export interface GetNearByAirportsParams {
  lat: number;
  lng: number;
  locale?: string; // default "en-US"
}

export interface GetFlightDetailsParams {
  itineraryId: string; // from searchFlights result
  legs: Array<{
    originPlaceId: string;
    destinationPlaceId: string;
    date: string;
  }>;
  sessionId: string; // from searchFlights result
  adults?: number;
  cabinClass?: string;
  currency?: string;
  market?: string;
  countryCode?: string;
}

export interface SearchFlightEverywhereParams {
  originSkyId: string;
  originEntityId: string;
  cabinClass?: "economy" | "premium_economy" | "business" | "first";
  adults?: number;
  currency?: string;
  market?: string;
  countryCode?: string;
}

export interface GetPriceCalendarParams {
  originSkyId: string;
  destinationSkyId: string;
  fromDate: string; // YYYY-MM-DD  start of calendar window
  toDate?: string; // YYYY-MM-DD  end of calendar window
  cabinClass?: "economy" | "premium_economy" | "business" | "first";
  currency?: string;
  market?: string;
  countryCode?: string;
}

export interface SearchIncompleteParams {
  sessionId: string; // continuation session from searchFlights
  sortBy?: string;
  limit?: number;
  currency?: string;
  market?: string;
  countryCode?: string;
}

/* ─────────────────────────────────────────────────────────────────
   1. searchAirport
   Look up SkyId + entityId for a city / airport name.
   Always call this first before any flight search.
───────────────────────────────────────────────────────────────── */
export async function searchAirport(params: SearchAirportParams) {
  const { data } = await client.get("/v1/flights/searchAirport", {
    params: {
      query: params.query,
      locale: "en-US",
    },
  });
  return data;
}

/* ─────────────────────────────────────────────────────────────────
   2. searchFlights_Version_2
   One-way or round-trip flight search using SkyIds and entityIds
   obtained from searchAirport.
───────────────────────────────────────────────────────────────── */
export async function searchFlights_Version_2(params: SearchFlightsV2Params) {
  const { data } = await client.get("/v2/flights/searchFlights", {
    params: {
      originSkyId: params.originSkyId,
      destinationSkyId: params.destinationSkyId,
      originEntityId: params.originEntityId,
      destinationEntityId: params.destinationEntityId,
      date: params.date,
      ...(params.returnDate && { returnDate: params.returnDate }),
      cabinClass: params.cabinClass ?? "economy",
      adults: params.adults ?? 1,
      childrens: params.childrens ?? 0,
      infants: params.infants ?? 0,
      sortBy: params.sortBy ?? "best",
      limit: params.limit ?? 10,
      ...(params.carriersIds && { carriersIds: params.carriersIds }),
      currency: "USD",
      market: "en-US",
      countryCode: params.countryCode ?? "US",
    },
  });
  return data;
}

/* ─────────────────────────────────────────────────────────────────
   3. searchFlightsMultiStops
   Multi-city / multi-leg flight search.
   Each leg requires its own origin/destination SkyId + entityId.
───────────────────────────────────────────────────────────────── */
export async function searchFlightsMultiStops(
  params: SearchFlightsMultiStopsParams,
) {
  const { data } = await client.get("/v1/flights/searchFlightsMultiStops", {
    params: {
      legs: JSON.stringify(params.legs),
      cabinClass: params.cabinClass ?? "economy",
      adults: params.adults ?? 1,
      childrens: params.childrens ?? 0,
      infants: params.infants ?? 0,
      currency: "USD",
      market: "en-US",
      countryCode: params.countryCode ?? "US",
    },
  });
  return data;
}

/* ─────────────────────────────────────────────────────────────────
   4. getNearByAirports
   Find airports closest to a lat/lng coordinate.
───────────────────────────────────────────────────────────────── */
export async function getNearByAirports(params: GetNearByAirportsParams) {
  const { data } = await client.get("/v1/flights/getNearByAirports", {
    params: {
      lat: params.lat,
      lng: params.lng,
      locale: "en-US",
    },
  });
  return data;
}

/* ─────────────────────────────────────────────────────────────────
   5. getFlightDetails
   Fetch full pricing, seat map, and booking link for a specific
   itinerary returned by searchFlights_Version_2.
───────────────────────────────────────────────────────────────── */
export async function getFlightDetails(params: GetFlightDetailsParams) {
  const { data } = await client.get("/v1/flights/getFlightDetails", {
    params: {
      itineraryId: params.itineraryId,
      legs: JSON.stringify(params.legs),
      sessionId: params.sessionId,
      adults: params.adults ?? 1,
      cabinClass: params.cabinClass ?? "economy",
      currency: "USD",
      market: "en-US",
      countryCode: params.countryCode ?? "US",
    },
  });
  return data;
}

/* ─────────────────────────────────────────────────────────────────
   6. searchFlightEverywhere
   Discover cheap destinations from an origin — no fixed destination.
───────────────────────────────────────────────────────────────── */
export async function searchFlightEverywhere(
  params: SearchFlightEverywhereParams,
) {
  const { data } = await client.get("/v2/flights/searchFlightEverywhere", {
    params: {
      originSkyId: params.originSkyId,
      originEntityId: params.originEntityId,
      cabinClass: params.cabinClass ?? "economy",
      adults: params.adults ?? 1,
      currency: "USD",
      market: "en-US",
      countryCode: params.countryCode ?? "US",
    },
  });
  return data;
}

/* ─────────────────────────────────────────────────────────────────
   7. getPriceCalendar
   Month-view cheapest fares between two airports across a date range.
───────────────────────────────────────────────────────────────── */
export async function getPriceCalendar(params: GetPriceCalendarParams) {
  const { data } = await client.get("/v1/flights/getPriceCalendar", {
    params: {
      originSkyId: params.originSkyId,
      destinationSkyId: params.destinationSkyId,
      fromDate: params.fromDate,
      ...(params.toDate && { toDate: params.toDate }),
      cabinClass: params.cabinClass ?? "economy",
      currency: "USD",
      market: "en-US",
      countryCode: params.countryCode ?? "US",
    },
  });
  return data;
}

/* ─────────────────────────────────────────────────────────────────
   8. searchIncomplete
   Continue / paginate a flight search using the sessionId from a
   previous searchFlights_Version_2 call that returned isComplete: false.
───────────────────────────────────────────────────────────────── */
export async function searchIncomplete(params: SearchIncompleteParams) {
  const { data } = await client.get("/v2/flights/searchIncomplete", {
    params: {
      sessionId: params.sessionId,
      sortBy: params.sortBy ?? "best",
      limit: params.limit ?? 10,
      currency: "USD",
      market: "en-US",
      countryCode: params.countryCode ?? "US",
    },
  });
  return data;
}
