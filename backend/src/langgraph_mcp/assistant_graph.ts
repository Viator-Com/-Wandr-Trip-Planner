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

const MAX_TOOLS_PER_SERVER = 30;

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

/* ------------------ Context helpers ------------------ */

/**
 * Extracts all ToolMessages from the conversation and returns a compact JSON
 * summary. The orchestrator and refiner both use this to chain tool outputs —
 * e.g. picking up a skyId from searchAirport before calling searchFlights.
 */
// ── Context helpers ──────────────────────────────────────────────────────────

async function buildToolResultSummary(
  messages: BaseMessage[],
  config: RunnableConfig,
): Promise<string> {
  const results: Array<{ tool: string; output: unknown }> = [];

  for (const msg of messages) {
    if (msg._getType() === "tool") {
      const toolMsg = msg as ToolMessage;
      let parsed: unknown = toolMsg.content;
      if (typeof toolMsg.content === "string") {
        try {
          parsed = JSON.parse(toolMsg.content);
        } catch {
          parsed = toolMsg.content;
        }
      }
      results.push({ tool: toolMsg.name ?? "unknown", output: parsed });
    }
  }

  if (!results.length) return "No tool calls have been made yet.";

  const MAX_CHARS = 40_000;
  const raw = JSON.stringify(results, null, 2);
  const truncated =
    raw.length > MAX_CHARS
      ? raw.slice(0, MAX_CHARS) + "\n\n[...truncated...]"
      : raw;

  const configuration = Configuration.fromRunnableConfig(config);
  const model = loadChatModel(configuration.summarizeConversationModel);

  const response = await model.invoke(
    [
      new HumanMessage(
        `Summarize the following tool call results concisely. ` +
          `Group by tool name. Use short bullet points.\n\n` +
          `CRITICAL RULES:\n` +
          `- Preserve ALL field names and values EXACTLY as they appear (e.g. originSkyId, destinationSkyId, entityId). Do NOT rename, rephrase, or relabel any field.\n` +
          `- Copy identifiers, IDs, codes, and keys character-for-character. Never paraphrase them.\n` +
          `- Highlight errors and important values, but quote them verbatim from the source.\n` +
          `- Omit only deeply nested raw data dumps that add no meaning.\n\n` +
          `${truncated}`,
      ),
    ],
    config,
  );

  if (typeof response.content === "string") return response.content;

  return response.content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

/**
 * Builds a compact list of already-executed tool calls (name + args only).
 * Passed to the orchestrator so it knows what NOT to repeat.
 */
function buildCallHistory(messages: BaseMessage[]): string {
  const calls: Array<{ tool: string; args: unknown }> = [];

  for (const msg of messages) {
    if (msg._getType() === "ai") {
      const aiMsg = msg as AIMessage;
      for (const tc of aiMsg.tool_calls ?? []) {
        calls.push({ tool: tc.name, args: tc.args });
      }
    }
  }

  return calls.length
    ? JSON.stringify(calls, null, 2)
    : "No tools have been called yet.";
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

  // // ── Build context blocks so the model can chain tool outputs ────────────────
  // const [toolResultSummary, callHistory] = await Promise.all([
  //   buildToolResultSummary(state.messages, config),
  //   Promise.resolve(buildCallHistory(state.messages)),
  // ]);

  console.error(
    `mcpOrchestrator: "${serverName}" tools available:`,
    tools.map((t) => toolName(t)),
  );
  // console.error(`mcpOrchestrator: call history:\n`, callHistory);
  // console.error(
  //   `mcpOrchestrator: tool results available:\n`,
  //   toolResultSummary,
  // );

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", configuration.mcpOrchestratorSystemPrompt],
    // Inject chaining context BEFORE conversation history so the model sees
    // what has already been called and what outputs are available to build on.
    [
      "system",
      `
    ## Already-called tools — do NOT repeat these exact calls   and   Tool outputs available for parameter chaining
       Extract IDs, codes, entity values, prices, tokens, and any other data you need
      for your NEXT tool call exclusively from the block below.
       {messages}`,
    ],
  ]);

  const model = loadChatModel(configuration.mcpOrchestratorModel);

  const msg = await prompt.invoke(
    {
      messages: state.messages,
      idk_response: IDK_RESPONSE,
      other_servers: "",
      other_servers_response: OTHER_SERVERS_MORE_RELEVANT,
      system_time: new Date().toISOString(),
      tripId: configuration.tripId ?? "none",
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
    return { current_mcp_server: "" };
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

  const stagedCalls = (state.pending_ai_message.tool_calls ?? []).map((tc) => ({
    name: tc.name,
    args: tc.args,
  }));

  // // ── Give the refiner full access to prior tool outputs for param extraction ─
  // const [toolResultSummary, callHistory] = await Promise.all([
  //   buildToolResultSummary(state.messages, config),
  //   Promise.resolve(buildCallHistory(state.messages)),
  // ]);

  // console.log("refineToolCall: tool info ->", toolInfo);
  // console.log("refineToolCall: staged calls ->", stagedCalls);
  // console.log(
  //   "refineToolCall: tool results available for param extraction:\n",
  //   toolResultSummary,
  // );

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", configuration.toolRefinerPrompt],
    ["placeholder", "{messages}"],
  ]);

  const model = loadChatModel(configuration.toolRefinerModel);

  const messageValue = await prompt.invoke(
    {
      messages: state.messages,
      tool_info: JSON.stringify(toolInfo),
      staged_tool_calls: JSON.stringify(stagedCalls),
      tripId: configuration.tripId ?? "none",
      system_time: new Date().toISOString(),
    },
    config,
  );

  const response = await model
    .bindTools([state.current_tool as any])
    .invoke(messageValue, config);

  console.log("refineToolCall -> refined call:", response);

  return {
    messages: [response],
    pending_ai_message: null,
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
          toolCall.name, // ← include name so buildToolResultSummary can label it
        ),
      );
    } catch (e) {
      console.error(`mcpToolCall: tool "${toolCall.name}" threw:`, e);
      messages.push(
        new ToolMessage(
          JSON.stringify({ error: String(e) }),
          toolCall.id,
          toolCall.name,
        ),
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

  const messages: ChatMessage[] = [];

  for (const msg of state.messages) {
    if (msg instanceof AIMessage && msg.content) {
      messages.push({
        label: "ai",
        content:
          typeof msg.content === "string"
            ? msg.content
            : JSON.stringify(msg.content),
        timestamp: new Date(),
      });
    } else if (msg instanceof HumanMessage && msg.content) {
      messages.push({
        label: "human",
        content: String(msg.content),
        timestamp: new Date(),
      });
    }
  }

  if (messages.length < 2) {
    return { conversation: null };
  }

  return {
    conversation: {
      messages: messages as unknown as [ChatMessage, ChatMessage],
    },
  };
}

/* ------------------ Routing ------------------ */

function routeAfterOrchestrator(state: State): string {
  if (state.pending_ai_message?.tool_calls?.length) {
    return "refineToolCall";
  }

  const last = state.messages.at(-1);
  if (last instanceof AIMessage && last.tool_calls?.length) {
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

  .addEdge("route", "handleMcpServers")

  .addConditionalEdges("handleMcpServers", routeAfterHandleMcpServers, {
    mcpOrchestrator: "mcpOrchestrator",
    responseComposer: "responseComposer",
  })

  .addConditionalEdges("mcpOrchestrator", routeAfterOrchestrator, {
    refineToolCall: "refineToolCall",
    handleMcpServers: "handleMcpServers",
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
