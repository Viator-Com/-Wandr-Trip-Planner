/**
 * MCP Router using LangGraph
 *
 * This module exposes two graphs:
 * - buildRouterGraph: builds and indexes a document for each MCP server
 * - assistantGraph: uses the index to:
 *     - decide which MCP server to route the user message to
 *     - decide which tool(s) in the MCP server to call
 *     - call the tool(s) and return the result(s)
 */

import { graph as assistantGraph } from "./assistant_graph.js";
import { graph as buildRouterGraph } from "./build_router_graph.js";

export { assistantGraph, buildRouterGraph };
