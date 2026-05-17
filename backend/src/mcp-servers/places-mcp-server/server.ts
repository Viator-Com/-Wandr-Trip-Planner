import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import "dotenv/config";

import { googlePlacesAPI, GooglePlacesError } from "./api.js";

/* ─────────────────────────────────────────
   Server
───────────────────────────────────────── */

const server = new McpServer({
  name: "places",
  version: "2.0.0",
});

/* ─────────────────────────────────────────
   Shared helpers
───────────────────────────────────────── */

function errorResponse(label: string, err: unknown) {
  const message =
    err instanceof GooglePlacesError
      ? `[${err.code ?? "ERROR"}] ${err.message}`
      : err instanceof Error
        ? err.message
        : "Unknown error";

  console.error(`[${label}]`, message);
  return {
    content: [
      { type: "text" as const, text: JSON.stringify({ error: message }) },
    ],
    isError: true,
  };
}

/* ─────────────────────────────────────────
   Google Places (New) place type enum
   https://developers.google.com/maps/documentation/places/web-service/place-types
───────────────────────────────────────── */

const GooglePlaceTypeEnum = z.enum([
  // Food & drink
  "restaurant",
  "cafe",
  "bar",
  "bakery",
  "fast_food_restaurant",
  "food_court",
  "ice_cream_shop",
  "meal_delivery",
  "meal_takeaway",
  "pizza_restaurant",
  "seafood_restaurant",
  "steak_house",
  "sushi_restaurant",
  "vegetarian_restaurant",
  // Accommodation
  "hotel",
  "motel",
  "bed_and_breakfast",
  "resort_hotel",
  "extended_stay_hotel",
  "hostel",
  "campground",
  "rv_park",
  // Shopping
  "shopping_mall",
  "supermarket",
  "convenience_store",
  "clothing_store",
  "electronics_store",
  "furniture_store",
  "hardware_store",
  "jewelry_store",
  "liquor_store",
  "pet_store",
  "pharmacy",
  "shoe_store",
  "book_store",
  "department_store",
  "gift_shop",
  "market",
  // Travel & transport
  "airport",
  "train_station",
  "bus_station",
  "subway_station",
  "taxi_stand",
  "transit_station",
  "car_rental",
  "car_repair",
  "car_wash",
  "gas_station",
  "parking",
  "rest_stop",
  // Tourism & attractions
  "tourist_attraction",
  "museum",
  "art_gallery",
  "aquarium",
  "zoo",
  "amusement_park",
  "theme_park",
  "casino",
  "movie_theater",
  "night_club",
  "bowling_alley",
  "comedy_club",
  "concert_hall",
  "cultural_center",
  "event_venue",
  "performing_arts_theater",
  "stadium",
  "water_park",
  // Nature & outdoors
  "park",
  "national_park",
  "campground",
  "beach",
  "hiking_area",
  "botanical_garden",
  "dog_park",
  "playground",
  "sports_complex",
  // Religious
  "church",
  "hindu_temple",
  "mosque",
  "synagogue",
  "buddhist_temple",
  // Health
  "hospital",
  "doctor",
  "dentist",
  "pharmacy",
  "physiotherapist",
  "gym",
  "spa",
  "beauty_salon",
  "hair_salon",
  // Finance
  "bank",
  "atm",
  // Government & services
  "police",
  "fire_station",
  "post_office",
  "city_hall",
  "courthouse",
  "embassy",
  "library",
  "school",
  "university",
]);

const TravelModeEnum = z.enum([
  "drive",
  "walk",
  "bicycle",
  "transit",
  "bus",
  "truckhazmat",
]);

/* ─────────────────────────────────────────
   Tool: search_destinations
───────────────────────────────────────── */

server.registerTool(
  "search_destinations",
  {
    description: `
      Search for places and points of interest using Google Places (New) Text Search.
      Accepts a natural-language query (city, landmark, or place name) with an optional
      Google place-type filter (e.g. 'restaurant', 'museum', 'hotel').
      Returns name, address, coordinates, rating, opening hours, and contact info.
      Use this for travel discovery and location-based browsing.
    `,
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          "City, landmark, or place name (e.g. 'Paris', 'Taj Mahal', 'coffee shops in Tokyo')",
        ),
      category: GooglePlaceTypeEnum.optional().describe(
        "Google Places place type to filter results (e.g. 'restaurant', 'museum', 'hotel')",
      ),
      limit: z.number().min(1).max(20).default(10),
    }),
  },
  async ({ query, category, limit }) => {
    try {
      const results = await googlePlacesAPI.searchPlaces(
        query,
        category,
        limit,
      );
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { query, category, count: results.length, destinations: results },
              null,
              2,
            ),
          },
        ],
      };
    } catch (err) {
      return errorResponse("search_destinations", err);
    }
  },
);

/* ─────────────────────────────────────────
   Tool: search_nearby
───────────────────────────────────────── */

server.registerTool(
  "search_nearby",
  {
    description: `
      Find places near a specific GPS coordinate using Google Places (New) Nearby Search.
      Results are ranked by distance and include an approximated distance in metres.
      Ideal for "what's near me" queries, finding restaurants around a hotel,
      or discovering attractions around any location.
    `,
    inputSchema: z.object({
      lat: z.number().min(-90).max(90).describe("Latitude of the centre point"),
      lon: z
        .number()
        .min(-180)
        .max(180)
        .describe("Longitude of the centre point"),
      category: GooglePlaceTypeEnum.optional().describe(
        "Google Places place type to filter results",
      ),
      radius: z
        .number()
        .min(100)
        .max(50_000)
        .default(2_000)
        .describe("Search radius in metres (max 50 000)"),
      limit: z.number().min(1).max(20).default(20),
    }),
  },
  async ({ lat, lon, category, radius, limit }) => {
    try {
      const results = await googlePlacesAPI.nearbyPlaces({
        lat,
        lon,
        category,
        radius,
        limit,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                centre: { lat, lon },
                radius_m: radius,
                category,
                count: results.length,
                places: results,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (err) {
      return errorResponse("search_nearby", err);
    }
  },
);

/* ─────────────────────────────────────────
   Tool: get_place_details
───────────────────────────────────────── */

server.registerTool(
  "get_place_details",
  {
    description: `
      Retrieve comprehensive details about a specific place using Google Places (New) Place Details.
      Returns metadata, address components, opening hours, photos, ratings, accessibility options,
      parking/payment options, editorial summary, and a Google Maps URI.
      Accepts either a Google place_id (preferred, from search results) or a lat/lon pair.
      Use this after searching to get the full profile of a chosen result.
    `,
    inputSchema: z
      .object({
        id: z
          .string()
          .optional()
          .describe(
            "Google Places place_id, e.g. 'places/ChIJN1t_tDeuEmsRUsoyG83frY4' or just the raw ID",
          ),
        lat: z.number().min(-90).max(90).optional(),
        lon: z.number().min(-180).max(180).optional(),
        lang: z.string().length(2).default("en"),
      })
      .refine(
        (d) =>
          (!!d.id && d.lat == null && d.lon == null) ||
          (!d.id && d.lat != null && d.lon != null),
        { message: "Provide either id OR both lat and lon — not both" },
      ),
  },
  async ({ id, lat, lon, lang }) => {
    try {
      // Normalise place_id: strip leading "places/" prefix if present
      const normalizedId = id?.startsWith("places/") ? id.slice(7) : id;

      const place = await googlePlacesAPI.getPlaceDetails({
        id: normalizedId,
        lat,
        lon,
        lang,
      });

      if (!place) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: "No place found" }),
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { query_mode: normalizedId ? "place_id" : "coordinates", place },
              null,
              2,
            ),
          },
        ],
      };
    } catch (err) {
      return errorResponse("get_place_details", err);
    }
  },
);

/* ─────────────────────────────────────────
   Tool: geocode_address
───────────────────────────────────────── */

server.registerTool(
  "geocode_address",
  {
    description: `
      Convert a human-readable address or place name into geographic coordinates (lat/lon)
      using the Google Geocoding API.
      Returns candidate results ranked by confidence, each with a place_id,
      formatted address, bounding box (viewport), and result type.
      Use this when you have an address string and need coordinates for further API calls.
    `,
    inputSchema: z.object({
      address: z
        .string()
        .describe("Full or partial address, city, or place name"),
      lang: z
        .string()
        .length(2)
        .default("en")
        .describe("Language for result labels"),
      limit: z.number().min(1).max(20).default(5),
    }),
  },
  async ({ address, lang, limit }) => {
    try {
      const results = await googlePlacesAPI.geocode(address, lang, limit);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { query: address, count: results.length, results },
              null,
              2,
            ),
          },
        ],
      };
    } catch (err) {
      return errorResponse("geocode_address", err);
    }
  },
);

/* ─────────────────────────────────────────
   Tool: reverse_geocode
───────────────────────────────────────── */

server.registerTool(
  "reverse_geocode",
  {
    description: `
      Convert GPS coordinates (lat/lon) into a human-readable address
      using the Google Geocoding API.
      Returns the nearest matching address with street, city, country,
      postcode, and a structured address component breakdown.
      Use this when you have coordinates and need to display a location label.
    `,
    inputSchema: z.object({
      lat: z.number().min(-90).max(90).describe("Latitude"),
      lon: z.number().min(-180).max(180).describe("Longitude"),
      lang: z.string().length(2).default("en"),
    }),
  },
  async ({ lat, lon, lang }) => {
    try {
      const result = await googlePlacesAPI.reverseGeocode(lat, lon, lang);
      if (!result) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "No address found for given coordinates",
              }),
            },
          ],
          isError: true,
        };
      }
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    } catch (err) {
      return errorResponse("reverse_geocode", err);
    }
  },
);

/* ─────────────────────────────────────────
   Tool: autocomplete_address
───────────────────────────────────────── */

server.registerTool(
  "autocomplete_address",
  {
    description: `
      Provide real-time address and place autocomplete suggestions using
      Google Places (New) Autocomplete API as the user types.
      Optionally biased toward a location (proximity circle) or filtered to a country.
      Note: coordinates are not returned by autocomplete — use get_place_details
      with the returned place_id to resolve full details including lat/lon.
      Useful for building search inputs, itinerary entry forms, or address pickers.
    `,
    inputSchema: z.object({
      text: z
        .string()
        .min(2)
        .describe("Partial address or place name typed by user"),
      type: z
        .enum([
          "geocode",
          "address",
          "establishment",
          "locality",
          "sublocality",
          "postal_code",
          "country",
          "administrative_area_level_1",
          "administrative_area_level_2",
        ])
        .optional()
        .describe("Restrict suggestions to this result type"),
      countryCode: z
        .string()
        .length(2)
        .optional()
        .describe(
          "ISO 3166-1 alpha-2 country code to restrict results (e.g. 'US', 'IN')",
        ),
      biasLat: z
        .number()
        .optional()
        .describe("Latitude to bias suggestions toward"),
      biasLon: z
        .number()
        .optional()
        .describe("Longitude to bias suggestions toward"),
      lang: z.string().length(2).default("en"),
      limit: z.number().min(1).max(5).default(5),
    }),
  },
  async ({ text, type, countryCode, biasLat, biasLon, lang, limit }) => {
    try {
      const bias =
        biasLat != null && biasLon != null
          ? { lat: biasLat, lon: biasLon }
          : undefined;
      const filter = countryCode ? { countrycode: countryCode } : undefined;

      const results = await googlePlacesAPI.autocomplete({
        text,
        type,
        bias,
        filter,
        lang,
        limit,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                query: text,
                note: "Use get_place_details with the place_id to resolve lat/lon",
                count: results.length,
                suggestions: results,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (err) {
      return errorResponse("autocomplete_address", err);
    }
  },
);

/* ─────────────────────────────────────────
   Tool: get_route
───────────────────────────────────────── */

server.registerTool(
  "get_route",
  {
    description: `
      Calculate a route between two or more waypoints using the Google Routes API (New).
      Supports driving, walking, cycling, and public transit.
      Returns total distance (metres), estimated travel time (seconds + human-readable),
      and turn-by-turn step instructions for each leg.
      Supports up to 25 waypoints (origin + destination + up to 23 intermediates).
      Use this for itinerary planning, commute estimation, or navigation.
    `,
    inputSchema: z.object({
      waypoints: z
        .array(
          z.object({
            lat: z.number().min(-90).max(90),
            lon: z.number().min(-180).max(180),
          }),
        )
        .min(2)
        .max(25)
        .describe("Ordered waypoints from origin to destination"),
      mode: TravelModeEnum.default("drive"),
      units: z.enum(["metric", "imperial"]).default("metric"),
      lang: z.string().length(2).default("en"),
    }),
  },
  async ({ waypoints, mode, units, lang }) => {
    try {
      const route = await googlePlacesAPI.getRoute({
        waypoints,
        mode,
        units,
        lang,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                mode,
                distance_m: route.distance,
                duration_s: route.time,
                duration_readable: `${Math.floor(route.time / 3600)}h ${Math.floor((route.time % 3600) / 60)}m`,
                legs: route.legs,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (err) {
      return errorResponse("get_route", err);
    }
  },
);

/* ─────────────────────────────────────────
   Start
───────────────────────────────────────── */

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[google-places] MCP server running on stdio");
}

main().catch((err) => {
  console.error("[google-places] Fatal error:", err);
  process.exit(1);
});
