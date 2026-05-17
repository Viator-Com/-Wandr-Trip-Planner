import { z } from "zod";

import { Document } from "@langchain/core/documents";
import {
  AIMessage,
  BaseMessage,
  HumanMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { RunnableConfig } from "@langchain/core/runnables";

import { StateGraph, START, END } from "@langchain/langgraph";

import { Configuration } from "./configuration.js";
import * as mcp from "./mcpWrapper.js";
import { makeRetriever } from "./retriever.js";
import { getMessageText, loadChatModel, formatDocs } from "./utils/utils.js";

import { State, InputState } from "./state.js";

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

/* ------------------ Constants ------------------ */

const NOTHING_RELEVANT =
  "No MCP server with an appropriate tool to address current context";
const IDK_RESPONSE = "No appropriate tool available.";
const OTHER_SERVERS_MORE_RELEVANT = "Other servers are more relevant.";
const AMBIGUITY_PREFIX = "Ambiguity:";

const MAX_TOOLS_PER_SERVER = 10;

/* ------------------ Schemas ------------------ */

const SearchQuerySchema = z.object({
  query: z.string(),
});

const RouteQuerySchema = z.object({
  content: z
    .array(
      z.enum([
        "flights",
        "tavily",
        "places",
        "db",
        NOTHING_RELEVANT,
        AMBIGUITY_PREFIX,
      ]),
    )
    .min(1),
});

export type ChatRole = "ai" | "human";

export interface ChatMessage {
  label: ChatRole;
  content: string;
  timestamp?: Date;
}

export type Conversation = {
  messages: [ChatMessage, ChatMessage];
};

/* ------------------ Tools cache ------------------ */

const toolsCache = new Map<string, Array<Record<string, any>>>();

function toolName(t: any): string | undefined {
  return t?.function?.name ?? t?.name;
}

function toolCallKey(name: string, args: unknown): string {
  try {
    const sortedArgs = JSON.stringify(args, Object.keys(args as object).sort());
    return `${name}:${sortedArgs}`;
  } catch {
    return `${name}:${String(args)}`;
  }
}

async function getTools(
  serverName: string,
  serverConfig: any,
): Promise<Array<Record<string, any>>> {
  if (toolsCache.has(serverName)) {
    return toolsCache.get(serverName)!;
  }
  const tools = await mcp.apply(serverName, serverConfig, new mcp.GetTools());
  console.error(
    `getTools: "${serverName}" raw tool names:`,
    tools.map((t: any) => toolName(t)),
  );
  toolsCache.set(serverName, tools);
  return tools;
}

function clearToolsCache(): void {
  toolsCache.clear();
}

/* ------------------ Nodes ------------------ */

export async function generateRoutingQuery(
  state: State,
  config: RunnableConfig,
): Promise<{ queries: string[] }> {
  const configuration = Configuration.fromRunnableConfig(config);

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", configuration.routingQuerySystemPrompt],
    ["placeholder", "{messages}"],
  ]);

  const model = loadChatModel(
    configuration.routingQueryModel,
  ).withStructuredOutput(SearchQuerySchema);

  const msg = await prompt.invoke(
    {
      messages: state.messages,
      queries: state.queries.join("\n- "),
      system_time: new Date().toISOString(),
    },
    config,
  );

  console.error("State Messages ->", state.messages);

  const result = await model.invoke(msg, config);
  console.log("generateRoutingQuery ->", result.query);
  return { queries: [result.query] };
}

export async function retrieve(
  state: State,
  config: RunnableConfig,
): Promise<{ retrieved_docs: Document[] }> {
  const query = state.queries.at(-1);
  if (!query) {
    console.error("retrieve: no query in state — returning empty docs");
    return { retrieved_docs: [] };
  }
  const retriever = await makeRetriever(config);
  const docs = await retriever.invoke(query, config);
  return { retrieved_docs: docs };
}

export async function route(
  state: State,
  config: RunnableConfig,
): Promise<{ messages?: BaseMessage[]; needed_mcp_server?: string[] }> {
  const configuration = Configuration.fromRunnableConfig(config);

  if (!state.messages.length) {
    console.error("route: no messages in state — skipping");
    return {};
  }

  const model = loadChatModel(
    configuration.routingResponseModel,
  ).withStructuredOutput(RouteQuerySchema);

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", "{routing_system_prompt}"],
    ["system", "Retrieved documents:\n{retrieved_docs}"],
    ["human", "{input}"],
  ]);

  const lastMsg = state.messages[state.messages.length - 1];
  const input =
    typeof lastMsg.content === "string"
      ? lastMsg.content
      : JSON.stringify(lastMsg.content);

  const msg = await prompt.invoke({
    input,
    retrieved_docs: formatDocs(state.retrieved_docs ?? []),
    routing_system_prompt: configuration.routingResponseSystemPrompt,
  });

  const response = await model.invoke(msg, config);

  let servers = response.content;

  if (
    servers.includes(NOTHING_RELEVANT) ||
    servers.includes(AMBIGUITY_PREFIX)
  ) {
    return {
      messages: [
        new AIMessage({
          content: JSON.stringify(response.content),
        }),
      ],
    };
  }

  if (servers.includes("db")) {
    if (!configuration.tripId) {
      console.error("route: stripping db — no tripId in config");
      servers = servers.filter((s) => s !== "db");
    }
  }

  console.error("route -> servers:", servers);
  return { needed_mcp_server: servers };
}

export async function handleMcpServers(state: State): Promise<{
  current_mcp_server: string;
  current_tool: undefined;
  called_tools: Set<string>;
  needed_mcp_server: string[];
}> {
  const remaining = [...(state.needed_mcp_server ?? [])];

  if (remaining.length === 0) {
    console.error("handleMcpServers: queue empty → responseComposer");
    return {
      current_mcp_server: "",
      current_tool: undefined,
      called_tools: new Set<string>(),
      needed_mcp_server: [],
    };
  }

  const current = remaining.shift()!;
  console.error("handleMcpServers: activating server ->", current);

  return {
    current_mcp_server: current,
    current_tool: undefined,
    called_tools: new Set<string>(),
    needed_mcp_server: remaining,
  };
}

export async function mcpOrchestrator(
  state: State,
  config: RunnableConfig,
): Promise<{
  messages?: BaseMessage[];
  pending_ai_message?: AIMessage | null;
  current_tool?: unknown;
  current_mcp_server?: string;
  called_tools?: Set<string>;
}> {
  const configuration = Configuration.fromRunnableConfig(config);
  const serverName = state.current_mcp_server;

  console.error("mcpOrchestrator: server ->", serverName);

  if (!serverName) {
    console.error("mcpOrchestrator: serverName is empty — exiting");
    return { current_mcp_server: "" };
  }

  const serverConfig = configuration.mcpServerConfig?.mcpServers?.[serverName];
  if (!serverConfig) {
    console.error(
      `mcpOrchestrator: no config for server "${serverName}" — skipping`,
    );
    return { current_mcp_server: "" };
  }

  let tools: Array<Record<string, any>>;
  try {
    tools = await getTools(serverName, serverConfig);
  } catch (err) {
    console.error(`mcpOrchestrator: getTools failed for "${serverName}":`, err);
    return { current_mcp_server: "" };
  }

  if (!tools.length) {
    console.error(
      `mcpOrchestrator: "${serverName}" returned 0 tools — skipping`,
    );
    return { current_mcp_server: "" };
  }

  console.error(
    `mcpOrchestrator: "${serverName}" tools available:`,
    tools.map((t) => toolName(t)),
  );

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", configuration.mcpOrchestratorSystemPrompt],
    ["placeholder", "{messages}"],
  ]);

  const model = loadChatModel(configuration.mcpOrchestratorModel);

  const msg = await prompt.invoke(
    {
      messages: state.messages,
      idk_response: IDK_RESPONSE,
      other_servers: "",
      other_servers_response: OTHER_SERVERS_MORE_RELEVANT,
      system_time: new Date().toISOString(),
      trip_id: configuration.tripId ?? "none",
    },
    config,
  );

  const response = await model.bindTools(tools).invoke(msg, config);

  const responseText =
    typeof response.content === "string" ? response.content.trim() : "";
  if (
    responseText === IDK_RESPONSE ||
    responseText === OTHER_SERVERS_MORE_RELEVANT
  ) {
    console.error(`mcpOrchestrator: model exit signal for "${serverName}"`);
    return { current_mcp_server: "" };
  }

  if (!(response instanceof AIMessage) || !response.tool_calls?.length) {
    console.error(
      `mcpOrchestrator: text-only response from "${serverName}" — server done`,
    );
    return { messages: [response], current_mcp_server: "" };
  }

  const pendingToolName = response.tool_calls[0].name;
  const tool = tools.find((t) => toolName(t) === pendingToolName);

  if (!tool) {
    console.error(
      `mcpOrchestrator: tool "${pendingToolName}" not found in "${serverName}" tools list`,
      `— available:`,
      tools.map((t) => toolName(t)),
    );
    return { current_mcp_server: "" };
  }

  console.error(
    `mcpOrchestrator: dispatching ${response.tool_calls.length} tool call(s):`,
    response.tool_calls.map((tc) => `${tc.name}(${JSON.stringify(tc.args)})`),
  );

  // ── KEY CHANGE: stage in pending_ai_message, NOT messages ─────────────────
  // This prevents an AIMessage(tool_calls) from sitting in state.messages
  // without a following ToolMessage, which OpenAI rejects with a 400.

  console.log("MCPORCHEST ->", response);
  return {
    pending_ai_message: response,
    current_tool: tool,
  };
}

// ── refineToolCall ────────────────────────────────────────────────────────────
export async function refineToolCall(
  state: State,
  config: RunnableConfig,
): Promise<{
  messages?: BaseMessage[];
  pending_ai_message?: null;
  current_tool?: null;
  called_tools?: Set<string>;
}> {
  if (!state.current_tool || !state.pending_ai_message) return {};

  const configuration = Configuration.fromRunnableConfig(config);
  const toolInfo = (state.current_tool as any)?.function ?? {};

  console.log("REFine tool info ->", toolInfo);

  // Serialize the orchestrator's staged tool calls so the refiner LLM knows
  // exactly which tool(s) were chosen and can ONLY adjust their arguments.
  const stagedCalls = (state.pending_ai_message.tool_calls ?? []).map((tc) => ({
    name: tc.name,
    args: tc.args,
  }));

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", configuration.toolRefinerPrompt],
    ["placeholder", "{messages}"],
  ]);

  const model = loadChatModel(configuration.toolRefinerModel);

  // state.messages is clean — no orphan AIMessage(tool_calls) in it.
  const messageValue = await prompt.invoke(
    {
      messages: state.messages,
      tool_info: JSON.stringify(toolInfo),
      // Pass the staged calls explicitly so the refiner can only improve args,
      // not pick different tools or add extra calls.
      staged_tool_calls: JSON.stringify(stagedCalls),
      system_time: new Date().toISOString(),
    },
    config,
  );

  const response = await model
    .bindTools([state.current_tool as any])
    .invoke(messageValue, config);

  console.log("refineToolCall ->", response);

  // ── Track the REFINED call keys, not the orchestrator's staged keys ────────
  // Orchestrator adds its own staged keys; here we add what was actually sent
  // to mcpToolCall so deduplication covers the real executed calls.

  return {
    messages: [response], // clean AIMessage(tool_calls) enters messages
    pending_ai_message: null, // clear staging field
    current_tool: null,
  };
}

export async function mcpToolCall(
  state: State,
  config: RunnableConfig,
): Promise<{ messages: ToolMessage[] }> {
  const last = state.messages.at(-1);

  if (!(last instanceof AIMessage) || !last.tool_calls?.length) {
    throw new Error(
      "mcpToolCall: called without a pending AIMessage tool call",
    );
  }

  if (!state.current_mcp_server) {
    throw new Error("mcpToolCall: no MCP server selected for tool execution");
  }

  const configuration = Configuration.fromRunnableConfig(config);
  const serverName = state.current_mcp_server;
  const serverConfig = configuration.mcpServerConfig?.mcpServers?.[serverName];

  if (!serverConfig) {
    throw new Error(
      `mcpToolCall: missing MCP config for server "${serverName}"`,
    );
  }

  const messages: ToolMessage[] = [];

  for (const toolCall of last.tool_calls) {
    if (!toolCall.id) {
      console.error(
        `mcpToolCall: skipping tool call with no id (name: "${toolCall.name}")`,
      );
      continue;
    }

    try {
      const output = await mcp.apply(
        serverName,
        serverConfig,
        new mcp.RunTool(toolCall.name, toolCall.args),
      );

      messages.push(
        new ToolMessage(
          typeof output === "string" ? output : JSON.stringify(output),
          toolCall.id,
        ),
      );
    } catch (e) {
      console.error(`mcpToolCall: tool "${toolCall.name}" threw:`, e);
      messages.push(
        new ToolMessage(JSON.stringify({ error: String(e) }), toolCall.id),
      );
    }
  }

  if (messages.length === 0) {
    throw new Error(
      "mcpToolCall: produced zero ToolMessages — all tool calls were skipped",
    );
  }

  return { messages };
}

export async function responseComposer(
  state: State,
  config: RunnableConfig,
): Promise<{ messages: BaseMessage[] }> {
  const configuration = Configuration.fromRunnableConfig(config);

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", configuration.toolResponseComposerPrompt],
    ["placeholder", "{messages}"],
  ]);

  const model = loadChatModel(configuration.toolResponseComposerModel);

  const msg = await prompt.invoke(
    {
      messages: state.messages,
      system_time: new Date().toISOString(),
    },
    config,
  );

  const response = await model.invoke(msg, config);
  console.error("responseComposer ->", response.content);
  return { messages: [response] };
}

export async function extractConversation(
  state: State,
  _config: RunnableConfig,
): Promise<{ conversation: Conversation | null }> {
  try {
    clearToolsCache();
    await mcp.closeAllSessions();
  } catch (err) {
    console.error("extractConversation: cleanup error (non-fatal):", err);
  }

  if (!state.messages || state.messages.length < 2) {
    return { conversation: null };
  }

  let lastHuman: ChatMessage | null = null;
  let lastAI: ChatMessage | null = null;

  for (let i = state.messages.length - 1; i >= 0; i--) {
    const msg = state.messages[i];

    if (!lastAI && msg instanceof AIMessage && msg.content) {
      lastAI = {
        label: "ai",
        content:
          typeof msg.content === "string"
            ? msg.content
            : JSON.stringify(msg.content),
        timestamp: new Date(),
      };
      continue;
    }

    if (!lastHuman && msg instanceof HumanMessage) {
      lastHuman = {
        label: "human",
        content: String(msg.content),
        timestamp: new Date(),
      };
    }

    if (lastHuman && lastAI) break;
  }

  if (lastHuman && lastAI) {
    return { conversation: { messages: [lastHuman, lastAI] } };
  }

  return { conversation: null };
}

/* ------------------ Routing ------------------ */

function routeAfterOrchestrator(state: State): string {
  // ── KEY CHANGE: check pending_ai_message, not state.messages ──────────────
  // mcpOrchestrator no longer pushes AIMessage(tool_calls) to messages;
  // it stages it here instead, so we check here for the routing decision.
  if (state.pending_ai_message?.tool_calls?.length) {
    return "refineToolCall";
  }

  const last = state.messages.at(-1);
  if (last instanceof AIMessage && last.tool_calls?.length) {
    // Fallback: should not normally happen with the new staging approach,
    // but handled defensively.
    return "refineToolCall";
  }

  return "handleMcpServers";
}

function routeAfterToolCall(state: State): string {
  if (state.current_mcp_server) {
    return "mcpOrchestrator";
  }
  return "handleMcpServers";
}

function routeAfterHandleMcpServers(state: State): string {
  if (state.current_mcp_server) {
    return "mcpOrchestrator";
  }
  return "responseComposer";
}

function routeAfterRefineToolCall(state: State): string {
  const last = state.messages.at(-1);
  if (last instanceof AIMessage && last.tool_calls?.length) {
    return "mcpToolCall";
  }
  // refineToolCall produced plain text or no message — skip tool execution
  return "handleMcpServers";
}

/* ------------------ Graph ------------------ */

const builder = new StateGraph(State);

builder
  .addNode("generateRoutingQuery", generateRoutingQuery)
  .addNode("retrieve", retrieve)
  .addNode("route", route)
  .addNode("handleMcpServers", handleMcpServers)
  .addNode("mcpOrchestrator", mcpOrchestrator)
  .addNode("refineToolCall", refineToolCall)
  .addNode("mcpToolCall", mcpToolCall)
  .addNode("responseComposer", responseComposer)
  .addNode("extractConversation", extractConversation)

  .addEdge(START, "generateRoutingQuery")
  .addEdge("generateRoutingQuery", "retrieve")
  .addEdge("retrieve", "route")

  .addConditionalEdges("route", (s: State) =>
    (s.needed_mcp_server ?? []).length > 0
      ? "handleMcpServers"
      : "responseComposer",
  )

  .addConditionalEdges("handleMcpServers", routeAfterHandleMcpServers, {
    mcpOrchestrator: "mcpOrchestrator",
    responseComposer: "responseComposer",
  })

  .addConditionalEdges("mcpOrchestrator", routeAfterOrchestrator, {
    refineToolCall: "refineToolCall",
    handleMcpServers: "handleMcpServers",
    responseComposer: "responseComposer",
  })

  .addConditionalEdges("refineToolCall", routeAfterRefineToolCall, {
    mcpToolCall: "mcpToolCall",
    handleMcpServers: "handleMcpServers",
  })

  .addEdge("mcpToolCall", "mcpOrchestrator")

  .addEdge("responseComposer", "extractConversation")
  .addEdge("extractConversation", END);

export const graph = builder.compile();
graph.name = "AssistantGraph";
