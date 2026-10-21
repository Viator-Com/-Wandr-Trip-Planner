/**
 * MCP tool layer: loading, allowlists, hard limits, execution, compaction.
 * Everything that touches an MCP server goes through here.
 */

import * as mcp from "./mcpWrapper.js";
import type { ServerName } from "./state.js";

export type ToolDef = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
};

/* ------------------ Allowlists (also filters deprecated tools) ------------------ */

export const SERVER_TOOL_ALLOWLIST: Record<ServerName, string[]> = {
  flights: ["search_flights"],
  places: [
    "search_destinations",
    "search_nearby",
    "get_place_details",
    "geocode_address",
    "reverse_geocode",
    "autocomplete_address",
    "get_route",
  ],
  tavily: ["tavily_search", "tavily_extract"],
};

/* ------------------ Hard limits: the worker loop can never run away ------------------ */

export interface ServerLimits {
  /** Max model turns for one worker run. */
  maxSteps: number;
  /** Max calls per tool name. */
  perTool: number;
  /** Tools that legitimately repeat with identical args (polling). tool -> max calls. */
  repeatable: Record<string, number>;
  /** Max characters kept per tool result. */
  maxOutputChars: number;
}

export const SERVER_LIMITS: Record<ServerName, ServerLimits> = {
  // One search per category (attractions / restaurants / hotels) in a single parallel step.
  places: { maxSteps: 5, perTool: 5, repeatable: {}, maxOutputChars: 6000 },
  // Second call is the "nearby hub airport" fallback when every option is poor.
  flights: { maxSteps: 4, perTool: 2, repeatable: {}, maxOutputChars: 16000 },
  tavily: { maxSteps: 4, perTool: 3, repeatable: {}, maxOutputChars: 6000 },
};

/* ------------------ Tool loading (cached, with TTL) ------------------ */

const TOOLS_TTL_MS = 30 * 60 * 1000;
const toolsCache = new Map<ServerName, { tools: ToolDef[]; at: number }>();

export function clearToolsCache(): void {
  toolsCache.clear();
}

export async function loadServerTools(
  server: ServerName,
  serverConfig: any,
): Promise<ToolDef[]> {
  const cached = toolsCache.get(server);
  if (cached && Date.now() - cached.at < TOOLS_TTL_MS) return cached.tools;

  const all = (await mcp.apply(
    server,
    serverConfig,
    new mcp.GetTools(),
  )) as ToolDef[];
  const allow = SERVER_TOOL_ALLOWLIST[server];
  const tools = all.filter((t) => allow.includes(t.function.name));

  toolsCache.set(server, { tools, at: Date.now() });
  return tools;
}

/* ------------------ Call signatures (dedupe) ------------------ */

// Args that models tweak between retries without changing intent.
const IGNORED_ARG_KEYS = new Set(["limit", "max_results", "maxResults"]);

function stable(v: any): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v)
      .filter((k) => !IGNORED_ARG_KEYS.has(k) && v[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(v[k])}`)
      .join(",")}}`;
  }
  if (typeof v === "string") return JSON.stringify(v.trim().toLowerCase());
  return JSON.stringify(v);
}

export function callSignature(name: string, args: unknown): string {
  return `${name}::${stable(args ?? {})}`;
}

/* ------------------ Output compaction ------------------ */

// Bulky fields the composer never needs (the Places server returns huge `periods` arrays).
const DROP_KEYS = new Set(["periods", "components", "raw_content"]);

function prune(v: any): any {
  if (Array.isArray(v)) return v.map(prune);
  if (v && typeof v === "object") {
    const out: Record<string, any> = {};
    for (const [k, val] of Object.entries(v)) {
      if (!DROP_KEYS.has(k)) out[k] = prune(val);
    }
    return out;
  }
  return v;
}

/**
 * Fit JSON into a character budget by dropping trailing items of the biggest array
 * instead of cutting the string mid-object (which left the composer with broken,
 * half-cut records, e.g. a flight with no booking link).
 */
function shrinkToFit(value: any, maxChars: number): string {
  let s = JSON.stringify(value);
  let guard = 0;

  while (s.length > maxChars && guard++ < 500) {
    const hit: { arr: any[] | null; len: number } = { arr: null, len: 0 };

    const visit = (v: any) => {
      if (Array.isArray(v)) {
        if (v.length > 2) {
          const len = JSON.stringify(v).length;
          if (len > hit.len) {
            hit.arr = v;
            hit.len = len;
          }
        }
        v.forEach(visit);
      } else if (v && typeof v === "object") {
        Object.values(v).forEach(visit);
      }
    };

    visit(value);
    if (!hit.arr) break;
    hit.arr.pop();
    s = JSON.stringify(value);
  }

  return s;
}

/** MCP returns JSON.stringify([{type:"text", text:"<json>"}]). Unwrap, prune, fit. */
export function compactToolOutput(raw: string, maxChars: number): string {
  let text = raw;

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      text = parsed
        .map((p) => (typeof p?.text === "string" ? p.text : JSON.stringify(p)))
        .join("\n");
    }
  } catch {
    /* keep raw */
  }

  try {
    text = shrinkToFit(prune(JSON.parse(text)), maxChars);
  } catch {
    /* not JSON */
  }

  return text.length > maxChars
    ? text.slice(0, maxChars) + "…[truncated]"
    : text;
}

/* ------------------ Execution ------------------ */

export interface ToolResult {
  ok: boolean;
  text: string;
}

export async function executeTool(
  server: ServerName,
  serverConfig: any,
  name: string,
  args: Record<string, any>,
  maxChars: number,
): Promise<ToolResult> {
  try {
    const out = await mcp.apply(
      server,
      serverConfig,
      new mcp.RunTool(name, args),
    );
    const raw = typeof out === "string" ? out : JSON.stringify(out);
    return { ok: true, text: compactToolOutput(raw, maxChars) };
  } catch (e: any) {
    return {
      ok: false,
      text: `ERROR: ${e?.message ?? String(e)}`.slice(0, 800),
    };
  }
}
