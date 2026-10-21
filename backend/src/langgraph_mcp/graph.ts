/**
 * WANDR AGENT GRAPH
 *
 *   START
 *     |
 *  planner ──(needs clarification)──> clarifier ──┐
 *     |   └─(chit-chat, no tools)──┐              |
 *  executor   staged, parallel MCP |              |
 *     |       (flights | places) -> tavily        |
 *     |       saved trip arrives in state.savedTrip|
 *  composer <──────────────────────┘              |
 *     |  writes the answer from findings          |
 *  finalizer <────────────────────────────────────┘
 *     |
 *    END
 *
 * Linear graph, no cycles: the only loops are inside workers, and those are bounded.
 * Node names differ from state keys on purpose (LangGraph forbids the clash).
 *
 * The planner writes ONE focused task per chosen server (plan.tasks), so a worker
 * never sees parts of the request that belong to another server.
 */

import { z } from "zod";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { RunnableConfig } from "@langchain/core/runnables";
import { StateGraph, START, END } from "@langchain/langgraph";

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

import { Configuration } from "./configruation.js";
import {
  composerPrompt,
  nowContext,
  plannerPrompt,
  todayISO,
} from "./prompts.js";
import {
  State,
  Finding,
  Plan,
  Trip,
  ServerName,
  Conversation,
  ChatMessage,
} from "./state.js";
import { loadChatModel } from "./utils/utils.js";
import { runWorker } from "./worker.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

export type { Conversation, ChatMessage };
export type ChatRole = "ai" | "human";

/* ------------------ Constants ------------------ */

/** Execution order. Servers inside one stage run in parallel. */
const STAGES: ServerName[][] = [["flights", "places"], ["tavily"]];

/** Max characters of the saved trip JSON given to planner, workers and composer. */
const SAVED_TRIP_CHARS = 12000;

/** Bookkeeping fields that only waste tokens. */
const SAVED_TRIP_DROP = new Set([
  "__v",
  "createdAt",
  "updatedAt",
  "userId",
  "user",
]);

const SERVER_ORDER: ServerName[] = STAGES.flat();

/** Only the last N human/AI messages go to the planner and composer. */
const HISTORY_WINDOW = 16;

/** Max characters of earlier findings forwarded to a later stage, per server. */
const PRIOR_CHARS_PER_SERVER = 4000;

/** Max characters of findings per server handed to the composer. */
const COMPOSER_CHARS_PER_SERVER = 32000;

/** One slow server must never hang the whole answer. */
const WORKER_TIMEOUT_MS = 100_000;

const FALLBACK_REPLY =
  "I ran into a problem putting that answer together. Please try again in a moment, or rephrase your question.";

/**
 * Nullable (not optional) on purpose: OpenAI structured output requires every key
 * to be present. A null task means "server not used".
 */
const TaskText = z.string().nullable();

const TripSchema = z.object({
  origin: z.string().nullable(),
  destination: z.string().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  days: z.number().nullable(),
  travelers: z.number().nullable(),
  budget: z.string().nullable(),
});

const PlanSchema = z.object({
  intent: z.enum(["trip_plan", "lookup", "chitchat"]),
  normalizedQuery: z.string(),
  trip: TripSchema,
  servers: z.array(z.enum(["flights", "places", "tavily"])),
  tasks: z.object({
    flights: TaskText,
    places: TaskText,
    tavily: TaskText,
  }),
  clarification: z.string().nullable(),
});

/* ------------------ Helpers ------------------ */

function formatFindings(findings: Finding[], maxChars: number): string {
  return findings
    .map((f) => {
      const header = `## ${f.server} — ${f.ok ? "ok" : "FAILED"}`;
      const err = f.error ? `\nError: ${f.error}` : "";
      return `${header}${err}\n${f.data.slice(0, maxChars)}`;
    })
    .join("\n\n");
}

/** Saved trip as compact JSON text, or null when none was pushed into the state. */
function savedTripText(state: State): string | null {
  if (!state.savedTrip) return null;
  const s = JSON.stringify(state.savedTrip, (k, v) =>
    SAVED_TRIP_DROP.has(k) ? undefined : v,
  );
  if (!s || s === "{}") return null;
  return s.length > SAVED_TRIP_CHARS
    ? s.slice(0, SAVED_TRIP_CHARS) + "…[truncated]"
    : s;
}

function withTimeout<T>(
  p: Promise<T>,
  ms: number,
  onTimeout: () => T,
): Promise<T> {
  let t: NodeJS.Timeout | undefined;
  return Promise.race([
    p,
    new Promise<T>((resolve) => {
      t = setTimeout(() => resolve(onTimeout()), ms);
    }),
  ]).finally(() => clearTimeout(t));
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p: any) => (typeof p === "string" ? p : (p?.text ?? "")))
      .join("");
  }
  return "";
}

function lastHumanText(state: State): string {
  for (let i = state.messages.length - 1; i >= 0; i--) {
    const m = state.messages[i];
    if (m instanceof HumanMessage) return String(m.content);
  }
  return "";
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** A valid, non-past YYYY-MM-DD or null. ISO dates compare correctly as strings. */
function cleanDate(v: string | null, today: string): string | null {
  if (!v || !ISO_DATE.test(v) || Number.isNaN(Date.parse(v))) return null;
  return v < today ? null : v;
}

const emptyTrip = (): Trip => ({
  origin: null,
  destination: null,
  startDate: null,
  endDate: null,
  days: null,
  travelers: null,
  budget: null,
});

function normalizeTrip(t: z.infer<typeof TripSchema>, today: string): Trip {
  const startDate = cleanDate(t.startDate, today);
  let endDate = cleanDate(t.endDate, today);
  if (endDate && startDate && endDate < startDate) endDate = null;

  const days =
    t.days && t.days >= 1 && t.days <= 30 ? Math.round(t.days) : null;

  // "4-day trip" starting the 15th returns on the 18th.
  if (startDate && !endDate && days && days > 1) {
    endDate = addDays(startDate, days - 1);
  }

  const travelers =
    t.travelers && t.travelers >= 1 && t.travelers <= 9
      ? Math.round(t.travelers)
      : null;

  return {
    origin: t.origin?.trim() || null,
    destination: t.destination?.trim() || null,
    startDate,
    endDate,
    days,
    travelers,
    budget: t.budget?.trim() || null,
  };
}

/** Deterministic flights task for trip plans: dates come from code, not from the LLM. */
function buildFlightsTask(trip: Trip): string | null {
  if (!trip.origin || !trip.destination || !trip.startDate) return null;
  const parts = [
    `${trip.endDate ? "Round-trip" : "One-way"} flights from ${trip.origin} to ${trip.destination}`,
    `departing ${trip.startDate}`,
  ];
  if (trip.endDate) parts.push(`returning ${trip.endDate}`);
  if (trip.travelers) parts.push(`${trip.travelers} adult(s)`);
  return parts.join(", ");
}

/** MCP content can legitimately contain the same URL with or without a trailing slash. */
function sanitizeLinks(text: string, evidence: string): string {
  const norm = (u: string) => u.replace(/[).,;]+$/, "").replace(/\/+$/, "");
  return text.replace(
    /(!?)\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g,
    (match, bang: string, label: string, url: string) => {
      if (evidence.includes(norm(url))) return match;
      return bang ? "" : label; // drop hallucinated images, keep the label of hallucinated links
    },
  );
}

function fallbackPlan(state: State): Plan {
  const q = lastHumanText(state).trim() || "travel help";
  return {
    intent: "lookup",
    normalizedQuery: q,
    trip: emptyTrip(),
    servers: ["tavily"],
    tasks: { tavily: q },
    clarification: null,
  };
}

/* ------------------ Nodes ------------------ */

/** Understand the request, extract trip facts, choose servers, write one focused task per server. */
export async function planner(
  state: State,
  config: RunnableConfig,
): Promise<{ plan: Plan }> {
  const cfg = Configuration.fromRunnableConfig(config);
  const model = loadChatModel(cfg.plannerModel).withStructuredOutput(
    PlanSchema,
  );

  let raw: z.infer<typeof PlanSchema>;
  try {
    raw = await model.invoke(
      [
        new SystemMessage(
          plannerPrompt({ now: nowContext(), savedTrip: savedTripText(state) }),
        ),
        ...state.messages.slice(-HISTORY_WINDOW),
      ],
      config,
    );
  } catch (e: any) {
    console.error("[planner] failed, using fallback plan:", e?.message ?? e);
    return { plan: fallbackPlan(state) };
  }

  const today = todayISO();
  const intent = raw.intent;
  const trip = normalizeTrip(raw.trip, today);

  // Deterministic validation on top of the LLM's choice.
  const chosen = new Set<ServerName>(raw.servers);

  if (intent === "chitchat") chosen.clear();

  if (intent === "trip_plan") {
    chosen.add("places");
    chosen.add("tavily");
    const sameCity =
      !!trip.origin &&
      !!trip.destination &&
      trip.origin.toLowerCase() === trip.destination.toLowerCase();
    if (trip.origin && trip.destination && trip.startDate && !sameCity) {
      chosen.add("flights");
    }
  }

  let servers = SERVER_ORDER.filter((s) => chosen.has(s));
  const hasSavedTrip = !!savedTripText(state);

  let clarification = raw.clarification?.trim() || null;
  if (
    !clarification &&
    intent === "trip_plan" &&
    !trip.destination &&
    !hasSavedTrip
  ) {
    clarification =
      "Where would you like to go, and roughly when? If you tell me where you're starting from and how many people are travelling, I'll plan flights too.";
  }

  // Empty is fine for chit-chat and for questions answered from the saved trip alone.
  const savedTripOnly = hasSavedTrip && raw.servers.length === 0;
  if (
    !servers.length &&
    !clarification &&
    intent !== "chitchat" &&
    !savedTripOnly
  ) {
    servers = ["tavily"];
  }

  const normalizedQuery = raw.normalizedQuery.trim();

  // One focused task per chosen server; fall back to the full query if the model left it empty.
  const tasks: Partial<Record<ServerName, string>> = {};
  for (const s of servers) {
    tasks[s] = raw.tasks[s]?.trim() || normalizedQuery;
  }
  if (intent === "trip_plan" && servers.includes("flights")) {
    const ft = buildFlightsTask(trip);
    if (ft) tasks.flights = ft;
  }

  const plan: Plan = {
    intent,
    normalizedQuery,
    trip,
    servers,
    tasks,
    clarification,
  };

  console.error("[planner]", JSON.stringify(plan));
  return { plan };
}

export async function clarifier(
  state: State,
): Promise<{ messages: AIMessage[] }> {
  return { messages: [new AIMessage(state.plan?.clarification ?? "")] };
}

/** Runs workers stage by stage. Later stages see earlier findings. */
export async function executor(
  state: State,
  config: RunnableConfig,
): Promise<{ findings: Finding[] }> {
  const cfg = Configuration.fromRunnableConfig(config);
  const plan = state.plan;
  if (!plan) return { findings: [] };

  const findings: Finding[] = [];
  const trip = savedTripText(state);
  const tripBlock = trip ? `## saved_trip (user's saved trip)\n${trip}` : "";

  for (const stage of STAGES) {
    const batch = stage.filter((s) => plan.servers.includes(s));
    if (!batch.length) continue;

    const prior = [tripBlock, formatFindings(findings, PRIOR_CHARS_PER_SERVER)]
      .filter(Boolean)
      .join("\n\n");

    const results = await Promise.all(
      batch.map((server) =>
        withTimeout(
          runWorker({
            server,
            // Each worker only sees its own task, never the whole request.
            query: plan.tasks?.[server] ?? plan.normalizedQuery,
            prior,
            configuration: cfg,
            config,
          }),
          WORKER_TIMEOUT_MS,
          (): Finding => ({
            server,
            ok: false,
            data: "",
            calls: [],
            error: `timed out after ${WORKER_TIMEOUT_MS / 1000}s`,
          }),
        ).catch(
          (e: any): Finding => ({
            server,
            ok: false,
            data: "",
            calls: [],
            error: e?.message ?? String(e),
          }),
        ),
      ),
    );

    findings.push(...results);
  }

  console.error(
    "[executor]",
    JSON.stringify(
      findings.map((f) => ({
        server: f.server,
        ok: f.ok,
        error: f.error,
        calls: f.calls,
        dataLen: f.data.length,
      })),
    ),
  );

  return { findings };
}

/** Writes the user-facing answer from findings only. */
export async function composer(
  state: State,
  config: RunnableConfig,
): Promise<{ messages: AIMessage[] }> {
  const cfg = Configuration.fromRunnableConfig(config);
  const model = loadChatModel(cfg.composerModel);
  const plan = state.plan;

  const findingsBlock = state.findings.length
    ? formatFindings(state.findings, COMPOSER_CHARS_PER_SERVER)
    : "No tool findings were retrieved.";

  const trip = savedTripText(state);

  const context = [
    `Intent: ${plan?.intent ?? "lookup"}`,
    `Resolved request: ${plan?.normalizedQuery ?? ""}`,
    plan?.intent === "trip_plan"
      ? `Trip context: ${JSON.stringify(plan.trip)}`
      : "",
    trip ? `<saved_trip>\n${trip}\n</saved_trip>` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const evidence = `${findingsBlock}\n${trip ?? ""}`;

  try {
    const response = await model.invoke(
      [
        new SystemMessage(composerPrompt({ now: nowContext() })),
        ...state.messages.slice(-HISTORY_WINDOW),
        new SystemMessage(
          `${context}\n\n<tool_findings>\n${findingsBlock}\n</tool_findings>`,
        ),
      ],
      config,
    );

    const text = sanitizeLinks(textOf(response.content), evidence).trim();
    return { messages: [new AIMessage(text || FALLBACK_REPLY)] };
  } catch (e: any) {
    console.error("[composer] failed:", e?.message ?? e);
    return { messages: [new AIMessage(FALLBACK_REPLY)] };
  }
}

/**
 * Expose the last human/AI exchange.
 * NOTE: MCP sessions are intentionally NOT closed here. They are process-wide and shared by
 * concurrent runs; closing them per run killed other users' in-flight calls and forced a cold
 * start on every message. Idle sessions are evicted by the TTL in mcpWrapper.
 */
export async function finalizer(
  state: State,
): Promise<{ conversation: Conversation | null }> {
  let lastHuman: ChatMessage | null = null;
  let lastAI: ChatMessage | null = null;

  for (let i = state.messages.length - 1; i >= 0; i--) {
    const msg = state.messages[i];

    if (!lastAI && msg instanceof AIMessage && msg.content) {
      lastAI = {
        label: "ai",
        content: textOf(msg.content) || JSON.stringify(msg.content),
        timestamp: new Date(),
      };
    } else if (!lastHuman && msg instanceof HumanMessage && msg.content) {
      lastHuman = {
        label: "human",
        content: String(msg.content),
        timestamp: new Date(),
      };
    }

    if (lastHuman && lastAI) break;
  }

  if (!lastHuman || !lastAI) return { conversation: null };
  return { conversation: { messages: [lastHuman, lastAI] } };
}

/* ------------------ Routing ------------------ */

function routeAfterPlanner(
  state: State,
): "clarifier" | "executor" | "composer" {
  const plan = state.plan;
  if (plan?.clarification) return "clarifier";
  if (!plan || !plan.servers.length) return "composer"; // chit-chat: no tools needed
  return "executor";
}

/* ------------------ Graph ------------------ */

const builder = new StateGraph(State)
  .addNode("planner", planner)
  .addNode("clarifier", clarifier)
  .addNode("executor", executor)
  .addNode("composer", composer)
  .addNode("finalizer", finalizer)

  .addEdge(START, "planner")
  .addConditionalEdges("planner", routeAfterPlanner, {
    clarifier: "clarifier",
    executor: "executor",
    composer: "composer",
  })
  .addEdge("clarifier", "finalizer")
  .addEdge("executor", "composer")
  .addEdge("composer", "finalizer")
  .addEdge("finalizer", END);

export const graph = builder.compile();
graph.name = "AssistantGraph";
