/**
 * Build Router Graph
 *
 * This graph:
 * - Collects routing descriptions from all MCP servers
 * - Stores them into the configured vector retriever
 */

import { Document } from "@langchain/core/documents";
import { RunnableConfig } from "@langchain/core/runnables";
import { StateGraph, START } from "@langchain/langgraph";

import { Configuration } from "./configuration.js";
import * as mcp from "./mcpWrapper.js";
import { makeRetriever } from "./retriever.js";
import { BuilderState } from "./state.js";

/* =========================================================
 * Build Router Node
 * =========================================================
 */

export async function buildRouter(
  state: BuilderState,
  config: RunnableConfig
): Promise<{ status: "success" | "failure" }> {
  let status: "success" | "failure" = "failure";

  try {
    const configuration = Configuration.fromRunnableConfig(config);

    type MCPServerConfig =
      | {
          transport: "stdio";
          command: string;
          args: string[];
          env?: Record<string, string>;
        }
      | {
          transport: "http";
          url: string;
          headers?: Record<string, string>;
        };

    const mcpServers = configuration.mcpServerConfig.mcpServers as Record<
      string,
      MCPServerConfig
    >;

    const routingDescriptions = await Promise.all(
      Object.entries(mcpServers).map(async ([serverName, serverConfig]) => {
        const description = await mcp.apply(
          serverName,
          serverConfig,
          new mcp.RoutingDescription()
        );

        return {
          serverName,
          description: String(description),
        };
      })
    );

    const documents = routingDescriptions.map(
      ({ serverName, description }) =>
        new Document({
          pageContent: description,
          metadata: { id: serverName },
        })
    );

    const retriever = await makeRetriever(config);

    if (configuration.retrieverProvider === "milvus") {
      await retriever.addDocuments(
        documents,
        documents.map((d) => d.metadata.id)
      );
    } else {
      await retriever.addDocuments(documents);
    }

    status = "success";
  } catch (err) {
    console.error("Exception in buildRouter:", err);
  }

  return { status };
}

/* ---------- Graph ---------- */

const builder = new StateGraph(BuilderState)
  .addNode("build_router", buildRouter)
  .addEdge(START, "build_router");

export const graph = builder.compile();
graph.name = "BuildRouterGraph";
