import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  searchAirport,
  searchFlights_Version_2,
  searchFlightsMultiStops,
  getNearByAirports,
  getFlightDetails,
  searchFlightEverywhere,
  getPriceCalendar,
  searchIncomplete,
} from "./api.js";

/* ─────────────────────────────────────────────────────────────────
   MCP Server bootstrap
───────────────────────────────────────────────────────────────── */

const server = new McpServer({
  name: "flights",
  version: "1.0.0",
});

/* ─────────────────────────────────────────────────────────────────
   Helper — wrap every tool handler so errors become MCP error content
   instead of crashing the server process.
───────────────────────────────────────────────────────────────── */
function wrap(
  fn: (...args: any[]) => Promise<any>,
): (
  ...args: any[]
) => Promise<{ content: Array<{ type: "text"; text: string }> }> {
  return async (...args) => {
    try {
      const result = await fn(...args);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    } catch (err: any) {
      const message = err?.response?.data
        ? JSON.stringify(err.response.data)
        : (err?.message ?? String(err));
      return {
        content: [{ type: "text", text: JSON.stringify({ error: message }) }],
        isError: true,
      };
    }
  };
}

/* ─────────────────────────────────────────────────────────────────
   1. searchAirport
───────────────────────────────────────────────────────────────── */
server.tool(
  "searchAirport",
  "Search for airports by city or airport name. Returns skyId and entityId required by all flight search tools. Always call this before any flight search.",
  {
    query: z
      .string()
      .describe("City or airport name to search, e.g. 'Jodhpur' or 'Delhi'"),
    locale: z
      .string()
      .optional()
      .default("en-US")
      .describe("Locale for response text, default en-US"),
  },
  wrap(async ({ query, locale }) => searchAirport({ query, locale })),
);

/* ─────────────────────────────────────────────────────────────────
   2. searchFlights_Version_2
───────────────────────────────────────────────────────────────── */
server.tool(
  "searchFlights_Version_2",
  "Search one-way or round-trip flights between two airports. Requires skyId and entityId for both origin and destination — obtain these from searchAirport first.",
  {
    originSkyId: z
      .string()
      .describe(
        "IATA-style SkyId of origin airport, e.g. 'JDH'. Must come from searchAirport result.",
      ),
    destinationSkyId: z
      .string()
      .describe(
        "IATA-style SkyId of destination airport, e.g. 'DEL'. Must come from searchAirport result.",
      ),
    originEntityId: z
      .string()
      .describe("entityId of origin airport returned by searchAirport."),
    destinationEntityId: z
      .string()
      .describe("entityId of destination airport returned by searchAirport."),
    date: z.string().describe("Departure date in YYYY-MM-DD format."),
    returnDate: z
      .string()
      .optional()
      .describe("Return date in YYYY-MM-DD format. Omit for one-way."),
    cabinClass: z
      .enum(["economy", "premium_economy", "business", "first"])
      .optional()
      .default("economy")
      .describe("Cabin class."),
    adults: z
      .number()
      .int()
      .min(1)
      .optional()
      .default(1)
      .describe("Number of adult passengers."),
    childrens: z
      .number()
      .int()
      .min(0)
      .optional()
      .default(0)
      .describe("Number of child passengers."),
    infants: z
      .number()
      .int()
      .min(0)
      .optional()
      .default(0)
      .describe("Number of infant passengers."),
    sortBy: z
      .enum([
        "best",
        "price_high",
        "fastest",
        "outbound_take_off_time",
        "outbound_landing_time",
        "return_take_off_time",
        "return_landing_time",
      ])
      .optional()
      .default("best")
      .describe("Sort order for results."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .default(10)
      .describe("Max number of results to return."),
    carriersIds: z
      .string()
      .optional()
      .describe("Comma-separated carrier IDs to filter by."),
    currency: z
      .string()
      .optional()
      .default("USD")
      .describe("Currency code for prices, e.g. USD, INR."),
    market: z.string().optional().default("en-US").describe("Market locale."),
    countryCode: z
      .string()
      .optional()
      .default("US")
      .describe("Two-letter country code."),
  },
  wrap(async (params) => searchFlights_Version_2(params)),
);

/* ─────────────────────────────────────────────────────────────────
   3. searchFlightsMultiStops
───────────────────────────────────────────────────────────────── */
server.tool(
  "searchFlightsMultiStops",
  "Search multi-city flights with 2 or more legs. Each leg needs its own origin/destination skyId and entityId from searchAirport.",
  {
    legs: z
      .array(
        z.object({
          originSkyId: z.string().describe("SkyId of leg origin."),
          destinationSkyId: z.string().describe("SkyId of leg destination."),
          originEntityId: z.string().describe("entityId of leg origin."),
          destinationEntityId: z
            .string()
            .describe("entityId of leg destination."),
          date: z
            .string()
            .describe("Departure date for this leg in YYYY-MM-DD."),
        }),
      )
      .min(2)
      .describe("Array of flight legs — minimum 2."),
    cabinClass: z
      .enum(["economy", "premium_economy", "business", "first"])
      .optional()
      .default("economy"),
    adults: z.number().int().min(1).optional().default(1),
    childrens: z.number().int().min(0).optional().default(0),
    infants: z.number().int().min(0).optional().default(0),
    currency: z.string().optional().default("USD"),
    market: z.string().optional().default("en-US"),
    countryCode: z.string().optional().default("US"),
  },
  wrap(async (params) => searchFlightsMultiStops(params)),
);

/* ─────────────────────────────────────────────────────────────────
   4. getNearByAirports
───────────────────────────────────────────────────────────────── */
server.tool(
  "getNearByAirports",
  "Find airports nearest to a GPS coordinate. Useful when the user mentions a location without specifying an airport.",
  {
    lat: z.number().describe("Latitude of the location."),
    lng: z.number().describe("Longitude of the location."),
    locale: z
      .string()
      .optional()
      .default("en-US")
      .describe("Locale for response text."),
  },
  wrap(async ({ lat, lng, locale }) => getNearByAirports({ lat, lng, locale })),
);

/* ─────────────────────────────────────────────────────────────────
   5. getFlightDetails
───────────────────────────────────────────────────────────────── */
server.tool(
  "getFlightDetails",
  "Fetch full pricing breakdown, baggage policy, seat availability and booking deep-link for a specific itinerary. Requires itineraryId and sessionId from a prior searchFlights_Version_2 result.",
  {
    itineraryId: z
      .string()
      .describe("itineraryId from a searchFlights_Version_2 result."),
    legs: z
      .array(
        z.object({
          originPlaceId: z
            .string()
            .describe("Place ID of leg origin from search result."),
          destinationPlaceId: z
            .string()
            .describe("Place ID of leg destination from search result."),
          date: z.string().describe("Date of leg in YYYY-MM-DD."),
        }),
      )
      .describe("Legs matching the selected itinerary."),
    sessionId: z
      .string()
      .describe("sessionId returned by searchFlights_Version_2."),
    adults: z.number().int().optional().default(1),
    cabinClass: z.string().optional().default("economy"),
    currency: z.string().optional().default("USD"),
    market: z.string().optional().default("en-US"),
    countryCode: z.string().optional().default("US"),
  },
  wrap(async (params) => getFlightDetails(params)),
);

/* ─────────────────────────────────────────────────────────────────
   6. searchFlightEverywhere
───────────────────────────────────────────────────────────────── */
server.tool(
  "searchFlightEverywhere",
  "Discover the cheapest destinations reachable from an origin airport — no specific destination needed. Great for 'where can I fly cheaply from X?' queries.",
  {
    originSkyId: z
      .string()
      .describe("SkyId of the departure airport from searchAirport."),
    originEntityId: z
      .string()
      .describe("entityId of the departure airport from searchAirport."),
    cabinClass: z
      .enum(["economy", "premium_economy", "business", "first"])
      .optional()
      .default("economy"),
    adults: z.number().int().min(1).optional().default(1),
    currency: z.string().optional().default("USD"),
    market: z.string().optional().default("en-US"),
    countryCode: z.string().optional().default("US"),
  },
  wrap(async (params) => searchFlightEverywhere(params)),
);

/* ─────────────────────────────────────────────────────────────────
   7. getPriceCalendar
───────────────────────────────────────────────────────────────── */
server.tool(
  "getPriceCalendar",
  "Show cheapest available fares day-by-day across a date range between two airports. Useful for 'cheapest day to fly' or flexible-date queries.",
  {
    originSkyId: z
      .string()
      .describe("SkyId of origin airport from searchAirport."),
    destinationSkyId: z
      .string()
      .describe("SkyId of destination airport from searchAirport."),
    fromDate: z.string().describe("Start of date range in YYYY-MM-DD."),
    toDate: z
      .string()
      .optional()
      .describe(
        "End of date range in YYYY-MM-DD. Defaults to one month from fromDate.",
      ),
    cabinClass: z
      .enum(["economy", "premium_economy", "business", "first"])
      .optional()
      .default("economy"),
    currency: z.string().optional().default("USD"),
    market: z.string().optional().default("en-US"),
    countryCode: z.string().optional().default("US"),
  },
  wrap(async (params) => getPriceCalendar(params)),
);

/* ─────────────────────────────────────────────────────────────────
   8. searchIncomplete
───────────────────────────────────────────────────────────────── */
server.tool(
  "searchIncomplete",
  "Continue or paginate a flight search that returned status:incomplete. Pass the sessionId from the original searchFlights_Version_2 response to fetch remaining results.",
  {
    sessionId: z
      .string()
      .describe(
        "sessionId from a prior searchFlights_Version_2 response where status:incomplete.",
      ),
    sortBy: z
      .string()
      .optional()
      .default("best")
      .describe("Sort order for continued results."),
    limit: z
      .number()
      .int()
      .optional()
      .default(10)
      .describe("Number of additional results to fetch."),
    currency: z.string().optional().default("USD"),
    market: z.string().optional().default("en-US"),
    countryCode: z.string().optional().default("US"),
  },
  wrap(async (params) => searchIncomplete(params)),
);

/* ─────────────────────────────────────────────────────────────────
   Start server over stdio (used by mcp-remote / LangGraph MCP client)
───────────────────────────────────────────────────────────────── */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("flights-mcp-server: running on stdio");
}

main().catch((err) => {
  console.error("flights-mcp-server: fatal error", err);
  process.exit(1);
});
