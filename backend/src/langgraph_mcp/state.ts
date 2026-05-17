/**
 * LangGraph State Definitions
 *
 * This file defines ALL state schemas used across graphs:
 * 1. Assistant Graph State
 * 2. Router Builder Graph State
 *
 * IMPORTANT RULES:
 * - LangGraph JS uses Annotation.Root(...)
 * - These are RUNTIME objects, not just types
 * - Never pass stateSchema / configSchema to StateGraph
 */

import { Annotation } from "@langchain/langgraph";
import { BaseMessage, AIMessage } from "@langchain/core/messages";
import { Document } from "@langchain/core/documents";

/* ============================================================================
   ASSISTANT INPUT STATE
   ----------------------------------------------------------------------------
   - External interface when invoking the assistant graph
   - Usually only contains messages
============================================================================ */

/**
 * InputState is what the outside world passes into the assistant graph.
 */
export const InputState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (a: BaseMessage[], b: BaseMessage[]): BaseMessage[] => a.concat(b),
    default: (): BaseMessage[] => [],
  }),
});

export type ChatRole = "ai" | "human";

export interface ChatMessage {
  label: ChatRole;
  content: string;
  timestamp?: Date;
}

export type Conversation = {
  messages: [ChatMessage, ChatMessage]; // human, ai
};

/* ============================================================================
   ASSISTANT INTERNAL STATE
   ----------------------------------------------------------------------------
   - Full working memory of the assistant
   - Used ONLY by assistant-graph.ts
============================================================================ */

export const State = Annotation.Root({
  /**
   * Full conversation history.
   * Always appends — messages are immutable once added.
   */
  messages: Annotation<BaseMessage[]>({
    reducer: (a: BaseMessage[], b: BaseMessage[]): BaseMessage[] => a.concat(b),
    default: (): BaseMessage[] => [],
  }),

  /**
   * Generated routing / search queries.
   * Appends each new query so history is preserved for re-routing.
   */
  queries: Annotation<string[]>({
    reducer: (a: string[], b: string[]): string[] => a.concat(b),
    default: (): string[] => [],
  }),

  /**
   * Documents retrieved from vector store.
   * Last-write-wins: each retrieve() call replaces the previous result.
   */
  retrieved_docs: Annotation<Document[]>({
    reducer: (_a: Document[], b: Document[]): Document[] => b,
    default: (): Document[] => [],
  }),

  /**
   * Queue of MCP server names selected by the router.
   *
   * TWO write patterns — both handled by this reducer:
   *
   * 1. APPEND (router populates the queue):
   *    route() returns a fresh string[] of server names → deduplicated append.
   *
   * 2. REPLACE (handleMcpServers drains the queue):
   *    handleMcpServers() returns the remaining array after popping the head.
   *    Detected when incoming is a strict tail of current (length shrank) →
   *    overwrite instead of append, so the queue truly advances.
   *
   * This dual-mode approach keeps LangGraph's single-reducer constraint while
   * supporting both the router's write and handleMcpServers' drain operation.
   */
  needed_mcp_server: Annotation<string[]>({
    reducer: (current: string[], incoming: string | string[]): string[] => {
      // Normalise to array
      const next: string[] = Array.isArray(incoming)
        ? incoming
        : incoming
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);

      // REPLACE mode: handleMcpServers returned the shortened remainder of
      // the queue. Detect by: next is shorter AND every element in next
      // matches the corresponding tail of current.
      if (
        next.length < current.length &&
        next.every((v, i) => current[current.length - next.length + i] === v)
      ) {
        return next;
      }

      // APPEND mode: router is adding new servers. Deduplicate.
      const merged = [...current, ...next];
      return merged.filter((v, i) => merged.indexOf(v) === i);
    },
    default: (): string[] => [],
  }),

  /**
   * The MCP server currently being orchestrated.
   * Set by handleMcpServers, cleared (set to "") when a server finishes.
   * Last-write-wins.
   */
  current_mcp_server: Annotation<string>({
    reducer: (_a: string, b: string): string => b,
    default: (): string => "",
  }),

  /**
   * The resolved tool object for the pending tool call.
   * Set by mcpOrchestrator, consumed and cleared by refineToolCall.
   * Last-write-wins.
   */
  current_tool: Annotation<unknown | undefined>({
    reducer: (
      _a: unknown | undefined,
      b: unknown | undefined,
    ): unknown | undefined => b,
    default: (): undefined => undefined,
  }),

  /**
   * Per-server tool call tracker.
   *
   * Tracks names of every tool already called on the CURRENT server.
   * Reset to an empty Set each time handleMcpServers activates a new server.
   * Used by mcpOrchestrator to:
   *   - Block duplicate calls within one server session (Guard 6).
   *   - Enforce MAX_TOOLS_PER_SERVER hard cap (Guard 4).
   *
   * Last-write-wins: callers always pass the complete updated Set.
   */

  pending_ai_message: Annotation<AIMessage | null>({
    value: (_prev, next) => next,
    default: () => null,
  }),

  /**
   * The most recent human ↔ AI exchange, extracted at the end of each run.
   * Stored for external consumers (e.g. conversation history UI).
   * Last-write-wins.
   */
  conversation: Annotation<Conversation | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
});

/* ============================================================================
   ROUTER BUILDER STATE
   ----------------------------------------------------------------------------
   - Used by build-router-graph.ts
   - Tracks indexing status of MCP routing descriptions
============================================================================ */
export const BuilderState = Annotation.Root({
  status: Annotation<"refresh" | "success" | "failure">({
    value: (_prev, next) => next,
    default: () => "refresh",
  }),
});

/* ============================================================================
   TYPES (FOR FUNCTION SIGNATURES ONLY)
============================================================================ */

/** Assistant graph runtime state */
export type State = typeof State.State;

/** Assistant graph input type */
export type InputState = typeof InputState.State;

/** Router builder graph runtime state */
export type BuilderState = typeof BuilderState.State;
