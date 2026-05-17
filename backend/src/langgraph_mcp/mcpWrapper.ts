import process from "process";

import { Client } from "@modelcontextprotocol/sdk/client";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { OpenAPISpec } from "./utils/openapi_spec.js";
import { openapiSpecToOpenAIFunction } from "./utils/openapi_utils.js";
import {
  mergeJsonStructure,
  extractInlinedOperationData,
} from "./utils/utils.js";

/* ------------------------------------------------------------------ */
/* Base abstraction                                                     */
/* ------------------------------------------------------------------ */

type MCPClient = InstanceType<typeof Client>;

export type MCPServerConfig =
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

export abstract class MCPSessionFunction<T = any> {
  abstract call(serverName: string, session: MCPClient): Promise<T>;
}

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const SESSION_TTL_MS = 10 * 60 * 1000; // evict after 10 min idle
const MCP_TIMEOUT_MS = 120_000; // 120s — covers RapidAPI cold starts
const RETRY_DELAY_MS = 2_000; // wait before retry after timeout
const MAX_RETRIES = 2;

/* ------------------------------------------------------------------ */
/* Persistent client cache                                             */
/* ------------------------------------------------------------------ */

interface CachedSession {
  client: MCPClient;
  config: MCPServerConfig;
  createdAt: number;
  lastUsedAt: number;
}

const sessionCache = new Map<string, CachedSession>();

function cleanEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

async function createTransport(serverConfig: MCPServerConfig) {
  if (serverConfig.transport === "stdio") {
    return new StdioClientTransport({
      command: serverConfig.command,
      args: serverConfig.args,
      env: {
        ...cleanEnv(process.env),
        ...(serverConfig.env ?? {}),
      },
    });
  }
  return new StreamableHTTPClientTransport(
    new URL(serverConfig.url),
    serverConfig.headers
      ? { requestInit: { headers: serverConfig.headers } }
      : undefined,
  );
}

async function createSession(
  serverName: string,
  serverConfig: MCPServerConfig,
): Promise<CachedSession> {
  console.error(`mcpWrapper: creating new session for "${serverName}"`);

  const transport = await createTransport(serverConfig);

  // Pass timeout so MCP SDK doesn't kill slow remote servers at the default 60s
  const client = new Client(
    { name: "langgraph-mcp-client", version: "1.0.0" },
    { timeout: MCP_TIMEOUT_MS } as any, // sdk typings vary by version
  );

  await client.connect(transport);
  console.error(`mcpWrapper: session established for "${serverName}"`);

  return {
    client,
    config: serverConfig,
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
  };
}

/**
 * Lightweight ping — if the transport is dead this throws.
 */
async function isSessionAlive(session: CachedSession): Promise<boolean> {
  try {
    await session.client.listTools();
    return true;
  } catch {
    return false;
  }
}

async function getOrCreateSession(
  serverName: string,
  serverConfig: MCPServerConfig,
): Promise<CachedSession> {
  const cached = sessionCache.get(serverName);

  if (cached) {
    const idleMs = Date.now() - cached.lastUsedAt;

    // Evict if idle too long
    if (idleMs > SESSION_TTL_MS) {
      console.error(
        `mcpWrapper: session for "${serverName}" idle ${Math.round(idleMs / 1000)}s — evicting`,
      );
      await closeSession(serverName);
    } else {
      // Health-check before reuse
      const alive = await isSessionAlive(cached);
      if (alive) {
        cached.lastUsedAt = Date.now();
        console.error(`mcpWrapper: reusing cached session for "${serverName}"`);
        return cached;
      }
      console.error(
        `mcpWrapper: session for "${serverName}" failed health check — recreating`,
      );
      await closeSession(serverName);
    }
  }

  const session = await createSession(serverName, serverConfig);
  sessionCache.set(serverName, session);
  return session;
}

/**
 * Call this at the end of a workflow/session to cleanly close all connections.
 */
export async function closeAllSessions(): Promise<void> {
  console.error(
    `mcpWrapper: closeAllSessions — evicting ${sessionCache.size} session(s)`,
  );
  const entries = [...sessionCache.entries()];
  sessionCache.clear();
  await Promise.allSettled(entries.map(([, { client }]) => client.close()));
}

/**
 * Close and evict a single server's session (e.g. after an error).
 */
export async function closeSession(serverName: string): Promise<void> {
  const cached = sessionCache.get(serverName);
  if (cached) {
    sessionCache.delete(serverName);
    await cached.client.close().catch(() => {});
  }
}

/* ------------------------------------------------------------------ */
/* Background TTL eviction — cleans up idle sessions every 60 s       */
/* ------------------------------------------------------------------ */

setInterval(async () => {
  const now = Date.now();
  for (const [name, session] of sessionCache.entries()) {
    if (now - session.lastUsedAt > SESSION_TTL_MS) {
      console.error(`mcpWrapper: TTL evicting idle session for "${name}"`);
      await closeSession(name);
    }
  }
}, 60_000).unref(); // .unref() so this timer won't prevent clean process exit

/* ------------------------------------------------------------------ */
/* Routing description                                                  */
/* ------------------------------------------------------------------ */

export class RoutingDescription extends MCPSessionFunction<[string, string]> {
  async call(
    serverName: string,
    session: MCPClient,
  ): Promise<[string, string]> {
    let content = "";

    try {
      const tools = await session.listTools();
      if (tools) {
        content += "Provides tools:\n";
        for (const tool of tools.tools) {
          content += `- ${tool.name}: ${tool.description ?? ""}\n`;
        }
        content += "---\n";
      }
    } catch (e) {
      console.error(`Tools fetch failed (${serverName})`, e);
    }

    try {
      const prompts = await session.listPrompts();
      if (prompts) {
        content += "Provides prompts:\n";
        for (const prompt of prompts.prompts) {
          content += `- ${prompt.name}: ${prompt.description ?? ""}\n`;
        }
        content += "---\n";
      }
    } catch (e) {
      console.error(`Prompts fetch failed (${serverName})`, e);
    }

    try {
      const resources = await session.listResources();
      if (resources) {
        content += "Provides resources:\n";
        for (const resource of resources.resources) {
          content += `- ${resource.name}: ${resource.description ?? ""}\n`;
        }
        content += "---\n";
      }
    } catch (e) {
      console.error(`Resources fetch failed (${serverName})`, e);
    }

    return [serverName, content];
  }
}

/* ------------------------------------------------------------------ */
/* Tool extraction                                                      */
/* ------------------------------------------------------------------ */

export class GetTools extends MCPSessionFunction<Array<Record<string, any>>> {
  async call(
    _serverName: string,
    session: MCPClient,
  ): Promise<Array<Record<string, any>>> {
    const tools = await session.listTools();
    if (!tools) return [];

    return tools.tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description ?? "",
        parameters: tool.inputSchema ?? {},
      },
    }));
  }
}

/* ------------------------------------------------------------------ */
/* OpenAPI tool mapping                                                 */
/* ------------------------------------------------------------------ */

export class GetOpenAPITools extends GetTools {
  private openapiSpecDict: Record<string, any>;
  private openapiSpec: OpenAPISpec;

  constructor(openapiSpec: Record<string, any>) {
    super();
    this.openapiSpecDict = openapiSpec;
    this.openapiSpec = OpenAPISpec.fromSpecDict(openapiSpec);
  }

  async call(
    _serverName: string,
    session: MCPClient,
  ): Promise<Array<Record<string, any>>> {
    const tools = await session.listTools();
    if (!tools) return [];

    const [openaiFns] = openapiSpecToOpenAIFunction(this.openapiSpec);

    openaiFns.forEach((fn: any, idx: number) => {
      const tool = tools.tools[idx];
      const opId = tool.name.split("-").slice(1).join("");

      fn.metadata = {
        tool_info: extractInlinedOperationData(this.openapiSpecDict, opId),
      };

      fn.parameters.properties = mergeJsonStructure(fn.parameters.properties);
      fn.name = tool.name;

      if (fn.description?.length > 1024) {
        fn.description = fn.description.slice(0, 1021) + "...";
      }
    });

    return openaiFns;
  }
}

/* ------------------------------------------------------------------ */
/* Tool execution                                                       */
/* ------------------------------------------------------------------ */

export class RunTool extends MCPSessionFunction<string> {
  private toolName: string;
  private args: Record<string, any>;

  constructor(toolName: string, args: Record<string, any> = {}) {
    super();
    this.toolName = toolName;
    this.args = args;
  }

  async call(_serverName: string, session: MCPClient): Promise<string> {
    const result = await session.callTool({
      name: this.toolName,
      arguments: this.args,
    });

    if (result.isError) {
      throw new Error(JSON.stringify(result.content));
    }

    return JSON.stringify(result.content);
  }
}

/* ------------------------------------------------------------------ */
/* apply() — single entry point with retry on timeout                 */
/* ------------------------------------------------------------------ */

export async function apply<T>(
  serverName: string,
  serverConfig: MCPServerConfig,
  fn: MCPSessionFunction<T>,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const session = await getOrCreateSession(serverName, serverConfig);

    try {
      session.lastUsedAt = Date.now();
      const result = await fn.call(serverName, session.client);
      session.lastUsedAt = Date.now();
      return result;
    } catch (err: any) {
      lastError = err;
      const isTimeout = err?.code === -32001;

      console.error(
        `mcpWrapper: attempt ${attempt}/${MAX_RETRIES} failed for "${serverName}":`,
        err?.message ?? err,
      );

      // Always evict the broken session before deciding whether to retry
      await closeSession(serverName);

      if (isTimeout && attempt < MAX_RETRIES) {
        console.error(
          `mcpWrapper: timeout on "${serverName}" — waiting ${RETRY_DELAY_MS}ms then retrying with fresh session`,
        );
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        continue; // next loop iteration calls getOrCreateSession → fresh session
      }

      // Non-timeout error or final attempt — propagate immediately
      throw err;
    }
  }

  throw lastError;
}
