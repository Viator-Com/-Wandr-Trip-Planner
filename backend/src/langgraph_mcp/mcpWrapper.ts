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
/* Persistent client cache                                             */
/* ------------------------------------------------------------------ */

interface CachedSession {
  client: MCPClient;
  config: MCPServerConfig;
}

const sessionCache = new Map<string, CachedSession>();

function cleanEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (typeof v === "string") {
      out[k] = v;
    }
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
  } else {
    return new StreamableHTTPClientTransport(
      new URL(serverConfig.url),
      serverConfig.headers
        ? { requestInit: { headers: serverConfig.headers } }
        : undefined,
    );
  }
}

async function getOrCreateSession(
  serverName: string,
  serverConfig: MCPServerConfig,
): Promise<MCPClient> {
  const cached = sessionCache.get(serverName);
  if (cached) {
    return cached.client;
  }

  const transport = await createTransport(serverConfig);
  const client = new Client({ name: "langgraph-mcp-client", version: "1.0.0" });
  await client.connect(transport);

  sessionCache.set(serverName, { client, config: serverConfig });
  return client;
}

/**
 * Call this at the end of a workflow/session to cleanly close all connections.
 */
export async function closeAllSessions(): Promise<void> {
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
/* MCP session lifecycle — now uses persistent cache                   */
/* ------------------------------------------------------------------ */

export async function apply<T>(
  serverName: string,
  serverConfig: MCPServerConfig,
  fn: MCPSessionFunction<T>,
): Promise<T> {
  const session = await getOrCreateSession(serverName, serverConfig);

  try {
    return await fn.call(serverName, session);
  } catch (err) {
    // On error, evict the cached session so the next call gets a fresh connection
    await closeSession(serverName);
    throw err;
  }
  // Note: no session.close() here — connection stays alive for reuse
}
