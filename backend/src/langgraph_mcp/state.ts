/**
 * Graph state.
 *
 * Only human/AI messages live in `messages`. Tool traffic never enters the
 * global history: each worker keeps its own scratchpad and hands back a
 * compact `Finding`. That keeps every prompt small and the loop bounded.
 */

import { Annotation } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";

export type ServerName = "flights" | "places" | "tavily";

/**
 * The user's saved trip document, loaded by the caller (activity) and pushed into the graph
 * state with every query. Shape is whatever your Trip model stores; it is treated as opaque JSON.
 */
export type SavedTrip = Record<string, any>;

/** trip_plan = "plan me a trip", lookup = any specific question, chitchat = no tools needed. */
export type Intent = "trip_plan" | "lookup" | "chitchat";

/** Structured trip facts the planner extracts from the whole conversation. */
export interface Trip {
  origin: string | null;
  destination: string | null;
  /** YYYY-MM-DD, validated in code. */
  startDate: string | null;
  /** YYYY-MM-DD. Derived in code from startDate + days when the user gave no return date. */
  endDate: string | null;
  days: number | null;
  travelers: number | null;
  budget: string | null;
}

export interface Plan {
  intent: Intent;
  /** Self-contained, pronoun-free restatement of the user's latest request. */
  normalizedQuery: string;
  trip: Trip;
  /** MCP servers to run (already validated + ordered). */
  servers: ServerName[];
  /**
   * One focused task per chosen server. Each worker sees only its own task,
   * so it never tries to handle parts of the request that belong elsewhere.
   */
  tasks: Partial<Record<ServerName, string>>;
  /** Set only when essential info is missing; the graph asks instead of guessing. */
  clarification: string | null;
}

export interface Finding {
  server: ServerName;
  ok: boolean;
  /** Compacted tool outputs, labelled by call. */
  data: string;
  /** Signatures of the calls made (for logging/debugging). */
  calls: string[];
  error?: string;
}

export type ChatRole = "ai" | "human";

export interface ChatMessage {
  label: ChatRole;
  content: string;
  timestamp?: Date;
}

export type Conversation = {
  messages: [ChatMessage, ChatMessage]; // human, ai
};

const append = <T>(a: T[], b: T[]): T[] => a.concat(b);
const replace = <T>(_a: T, b: T): T => b;

export const InputState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: append,
    default: () => [],
  }),
  savedTrip: Annotation<SavedTrip | null>({
    reducer: replace,
    default: () => null,
  }),
});

export const State = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: append,
    default: () => [],
  }),

  /** Saved trip pushed in with the query (replaces the old db MCP server). */
  savedTrip: Annotation<SavedTrip | null>({
    reducer: replace,
    default: () => null,
  }),

  plan: Annotation<Plan | null>({
    reducer: replace,
    default: () => null,
  }),

  findings: Annotation<Finding[]>({
    reducer: replace,
    default: () => [],
  }),

  conversation: Annotation<Conversation | null>({
    reducer: replace,
    default: () => null,
  }),
});

export type State = typeof State.State;
export type InputState = typeof InputState.State;
