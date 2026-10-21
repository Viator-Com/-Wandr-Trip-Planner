import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { FlightToolError, getConnection } from "./kiwiclient.js";
import { searchFlightsFlow } from "./flights.js";

const DEFAULT_CURRENCY = (process.env.DEFAULT_CURRENCY ?? "USD").toUpperCase();

const server = new McpServer({ name: "flights", version: "2.0.0" });

/** Errors become MCP error content instead of crashing the process. */
function wrap<A>(fn: (args: A) => Promise<unknown>) {
  return async (args: A) => {
    try {
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(await fn(args)) },
        ],
      };
    } catch (err: any) {
      const body =
        err instanceof FlightToolError
          ? { error: err.message, hint: err.hint }
          : { error: err?.message ?? String(err) };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(body) }],
        isError: true,
      };
    }
  };
}

server.tool(
  "search_flights",
  "Search live flights between two cities or airports in ONE call (powered by Kiwi.com). " +
    "Pass city names or IATA codes exactly as the user gave them; airports are resolved internally, " +
    "so no airport lookup or follow-up call is ever needed. " +
    "Returns the best, cheapest and fastest options with prices, times, stops, layovers and booking links. " +
    "Supports one-way and round-trip, up to ±3 flexible days, and passenger mix. " +
    "Do not call it again for the same route and date.",
  {
    origin_city: z
      .string()
      .min(2)
      .describe(
        "Departure city or airport as the user wrote it, e.g. 'Jaipur', 'New Delhi' or 'DEL'.",
      ),
    destination_city: z
      .string()
      .min(2)
      .describe(
        "Arrival city or airport as the user wrote it, e.g. 'Mumbai' or 'BOM'.",
      ),
    date: z.string().describe("Departure date, absolute YYYY-MM-DD."),
    return_date: z
      .string()
      .optional()
      .describe("Return date YYYY-MM-DD. Omit for a one-way trip."),
    flexible_days: z
      .number()
      .int()
      .min(0)
      .max(3)
      .optional()
      .default(0)
      .describe(
        "Search ± this many days around the dates (0-3). Use only if the user is flexible.",
      ),
    adults: z.number().int().min(1).max(9).optional().default(1),
    children: z.number().int().min(0).max(8).optional().default(0),
    infants: z.number().int().min(0).max(4).optional().default(0),
    cabin_class: z
      .enum(["economy", "premium_economy", "business", "first"])
      .optional()
      .default("economy"),
    currency: z
      .string()
      .length(3)
      .optional()
      .describe(
        `3-letter currency code for prices (default ${DEFAULT_CURRENCY}), e.g. INR.`,
      ),
  },
  wrap(async (a) =>
    searchFlightsFlow({
      origin: a.origin_city,
      destination: a.destination_city,
      date: a.date,
      returnDate: a.return_date,
      flexibleDays: a.flexible_days,
      adults: a.adults,
      children: a.children,
      infants: a.infants,
      cabinClass: a.cabin_class,
      currency: (a.currency ?? DEFAULT_CURRENCY).toUpperCase(),
    }),
  ),
);

async function main() {
  await server.connect(new StdioServerTransport());
  console.error("flights-mcp-server (kiwi): running on stdio");

  // Warm up and validate Kiwi's schema now so problems show at startup, not mid-chat.
  getConnection().catch((e) =>
    console.error(
      "flights-mcp-server (kiwi): startup check failed:",
      e?.message ?? e,
    ),
  );
}

main().catch((err) => {
  console.error("flights-mcp-server (kiwi): fatal error", err);
  process.exit(1);
});
