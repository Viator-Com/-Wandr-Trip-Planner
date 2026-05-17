/**
 * Configuration for MCP routing and orchestration.
 *
 * This file defines ALL tunable knobs for:
 * - embeddings
 * - retrievers
 * - MCP servers
 * - LLM models
 * - system prompts
 *
 * This is injected into LangGraph via RunnableConfig.
 */

import { RunnableConfig } from "@langchain/core/runnables";
import * as prompts from "./prompts.js";

/* =========================================================
 * Configuration Type
 * =========================================================
 */

export class Configuration {
  tripId: string | null = null;
  /* ---------------- Embeddings & Retrieval ---------------- */

  /**
   * Embedding model used for routing vector store.
   * Example: openai/text-embedding-3-large
   */
  embeddingModel: string = "openai/text-embedding-3-large";

  /**
   * Retriever provider used for routing.
   * Currently constrained to "milvus".
   */
  retrieverProvider: "milvus" = "milvus";

  /**
   * MCP server configurations.
   * Shape:
   * {
   *   mcpServers: {
   *     flights: { command, args, description, env? },
   *     hotels: { ... }
   *   }
   * }
   */

  mcpServerConfig: Record<string, any> = {
    mcpServers: {
      places: {
        transport: "stdio",
        command: "node",
        args: [
          "/Users/ravindrarinwa/Desktop/trip-planner/backend/build/mcp-servers/places-mcp-server/server.js",
        ],
        description: "PLACES MCP server",
      },
      tavily: {
        transport: "http",
        url: `https://mcp.tavily.com/mcp/?tavilyApiKey=${process.env.TAVILY_API_KEY}`,
        headers: {
          Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
          "Content-Type": "application/json",
        },
        description: "Tavily remote search MCP server",
      },
      db: {
        transport: "stdio",
        command: "node",
        args: [
          "/Users/ravindrarinwa/Desktop/trip-planner/backend/build/mcp-servers/database-mcp-server/server.js",
        ],
        description: "DATABASE MCP server",
      },
      flights: {
        transport: "stdio",
        command: "npx",
        args: [
          "mcp-remote",
          "https://mcp.rapidapi.com",
          "--header",
          "x-api-host: sky-scrapper.p.rapidapi.com",
          "--header",
          `x-api-key: ${process.env.RAPID_API}`,
        ],
        description: "Skyscanner flight search MCP server via RapidAPI",
      },
    },
  };

  /* ---------------- Routing (Query Generation) ---------------- */

  routingQuerySystemPrompt: string = prompts.ROUTING_QUERY_SYSTEM_PROMPT;

  routingQueryModel: string = "gpt-4o-mini";

  /* ---------------- Routing (Response Selection) ---------------- */

  routingResponseSystemPrompt: string = prompts.ROUTING_RESPONSE_SYSTEM_PROMPT;

  routingResponseModel: string = "gpt-4o-mini";

  /* ---------------- MCP Orchestration ---------------- */

  mcpOrchestratorSystemPrompt: string = prompts.MCP_ORCHESTRATOR_SYSTEM_PROMPT;

  mcpOrchestratorModel: string = "gpt-5-mini";

  /* ---------------- Tool  Response COMPOSER ---------------- */

  toolResponseComposerModel: string = "gpt-5-mini";

  toolResponseComposerPrompt: string = prompts.RESPONSE_COMPOSER_PROMPT;

  /* ---------------- Tool Refinement ---------------- */

  toolRefinerModel: string = "gpt-4o-mini";

  toolRefinerPrompt: string = prompts.TOOL_REFINER_PROMPT;

  /* ---------------- Conversation Summarization ---------------- */

  summarizeConversationModel: string = "gpt-4o-mini";

  summarizeConversationSystemPrompt: string =
    prompts.SUMMARIZE_CONVERSATION_PROMPT;

  /* =========================================================
   * Factory: Build Configuration from RunnableConfig
   * =========================================================
   */

  static fromRunnableConfig(config?: RunnableConfig): Configuration {
    const cfg = (config?.configurable ?? {}) as Record<string, any>;
    const instance = new Configuration();

    /**
     * Only copy known fields.
     * This prevents accidental injection of unknown keys.
     */
    for (const key of Object.keys(instance)) {
      if (cfg[key] !== undefined) {
        (instance as any)[key] = cfg[key];
      }
    }

    return instance;
  }

  /* =========================================================
   * Helper: MCP Server Descriptions
   * =========================================================
   */

  /**
   * Returns:
   * [
   *   ["flights", "Handles flight search and booking"],
   *   ["hotels", "Handles hotel search and booking"]
   * ]
   */
  getMcpServerDescriptions(): Array<[string, string]> {
    const servers = this.mcpServerConfig?.mcpServers ?? {};

    return Object.entries(servers).map(
      ([serverName, serverConfig]: [string, any]) => [
        serverName,
        serverConfig.description,
      ],
    );
  }
}
