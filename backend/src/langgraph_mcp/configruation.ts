/**
 * Tunable knobs, injected through RunnableConfig.configurable.
 */

import path from "path";
import { fileURLToPath } from "url";
import { RunnableConfig } from "@langchain/core/runnables";
import { SUMMARIZE_CONVERSATION_PROMPT } from "./prompts.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Works from both src/langgraph_mcp2 (tsx) and build/langgraph_mcp2 (compiled):
 * both resolve to <backend>/build/mcp-servers. Override with MCP_SERVERS_DIR if your layout differs.
 */
const MCP_DIR =
  process.env.MCP_SERVERS_DIR ??
  path.resolve(__dirname, "../../build/mcp-servers");

const serverEntry = (name: string) => path.join(MCP_DIR, name, "server.js");

export class Configuration {
  /* ---------------- Models (one per role) ---------------- */

  /** Intent + trip extraction + server selection. Needs reliable structured output. */
  plannerModel: string = process.env.PLANNER_MODEL ?? "gpt-4.1-mini";

  /** Tool-calling workers. Sloppy tool use is the usual symptom of a model that is too weak. */
  workerModel: string = process.env.WORKER_MODEL ?? "gpt-4.1-mini";

  /**
   * Final answer writer. This is where hallucinated prices/timings come from, so it gets the
   * strongest model. Drop to "gpt-4.1-mini" to save cost.
   */
  composerModel: string = process.env.COMPOSER_MODEL ?? "gpt-4.1";

  /* ---------------- MCP servers ---------------- */

  mcpServerConfig: Record<string, any> = {
    mcpServers: {
      places: {
        transport: "stdio",
        command: "node",
        args: [serverEntry("places-mcp-server")],
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
      flights: {
        transport: "stdio",
        command: "node",
        args: [serverEntry("flights-mcp-server")],
        env: {
          DEFAULT_CURRENCY: "INR",
          // KIWI_DEBUG: "1",   // uncomment to log Kiwi's schema + raw output to stderr
        },
        description:
          "FLIGHTS MCP server (Kiwi.com): one-call live flight search with best/cheapest/fastest options and booking links. Accepts city names or IATA codes.",
      },
    },
  };

  /* ---------------- Conversation summarisation (used elsewhere) ---------------- */

  summarizeConversationModel: string = "gpt-4o-mini";
  summarizeConversationSystemPrompt: string = SUMMARIZE_CONVERSATION_PROMPT;

  /* ---------------- Legacy: only retriever.ts / router-builder use these ---------------- */

  embeddingModel: string = "openai/text-embedding-3-large";
  retrieverProvider: "milvus" = "milvus";

  static fromRunnableConfig(config?: RunnableConfig): Configuration {
    const cfg = (config?.configurable ?? {}) as Record<string, any>;
    const instance = new Configuration();
    for (const key of Object.keys(instance)) {
      if (cfg[key] !== undefined) (instance as any)[key] = cfg[key];
    }
    return instance;
  }

  getMcpServerDescriptions(): Array<[string, string]> {
    const servers = this.mcpServerConfig?.mcpServers ?? {};
    return Object.entries(servers).map(
      ([name, c]: [string, any]) => [name, c.description] as [string, string],
    );
  }
}
