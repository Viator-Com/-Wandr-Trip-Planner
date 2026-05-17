import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import "dotenv/config";
import { fetchTrip } from "./api.js";

const server = new McpServer({
  name: "db",
  version: "1.0.0",
});

server.registerTool(
  "fetch-trip-from-database",
  {
    description: `
    Returns the persisted trip record associated with the provided tripId.
    Includes trip details, dates, and itinerary data.
    Read-only operation.
   `,
    inputSchema: z.object({
      tripId: z.string().describe("Trip ID in database"),
    }),
  },
  async (args) => {
    const result = await fetchTrip(args.tripId);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  },
);

/* ─────────────────────────────────────────
   Start
───────────────────────────────────────── */

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("DATABASE MCP server running on stdio");
}

main().catch((err) => {
  console.error("db Fatal error:", err);
  process.exit(1);
});
