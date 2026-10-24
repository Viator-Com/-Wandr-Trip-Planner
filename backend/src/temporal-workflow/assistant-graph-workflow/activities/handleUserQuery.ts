import { ApplicationFailure } from "@temporalio/activity";
import { graph as assistantGraph } from "../../../langgraph_mcp/graph.js";
import type {
  ChatMessage,
  ChatRole,
  Conversation,
} from "../../../langgraph_mcp/graph.js";
import { HumanMessage, AIMessage, BaseMessage } from "@langchain/core/messages";
import mongoose from "mongoose";
import { getChatByTripIdService } from "../../../services/getChatByTripIdService.js";
import { appendConversationService } from "../../../services/appendConversationservice.js";
import { getTripByIdService } from "../../../services/getTripByIdService.js";

// Re-exported so existing imports of these types from this file keep working.
export type { ChatMessage, ChatRole, Conversation };

/* ------------------------------------------------------------------ */
/* Shared types. Everything crossing an activity boundary must be      */
/* plain JSON (no LangChain message objects, no Mongoose documents).   */
/* ------------------------------------------------------------------ */

export type HistoryMessage = { label: "human" | "ai"; content: string };

export type LoadedContext = {
  history: HistoryMessage[];
  savedTrip: Record<string, any> | null;
};

export type RunGraphResult = {
  conversation: Conversation | null;
  reply: string | null;
};

const toRawTripId = (tripId: string) => tripId.replace("assistant-", "");

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/**
 * Loads the saved trip as plain JSON.
 * A missing or failing trip must never fail the user's question, so errors become null.
 */
async function loadSavedTrip(
  tripId: string,
): Promise<Record<string, any> | null> {
  try {
    const trip: any = await getTripByIdService(tripId);
    if (!trip) return null;
    return typeof trip.toObject === "function"
      ? trip.toObject()
      : JSON.parse(JSON.stringify(trip));
  } catch (error: any) {
    console.error(
      "[loadSavedTrip] failed (continuing without it):",
      error?.message ?? error,
    );
    return null;
  }
}

function flattenHistory(
  conversations: {
    messages: { label: "human" | "ai"; content: string }[];
  }[],
): HistoryMessage[] {
  const history: HistoryMessage[] = [];
  for (const convo of conversations) {
    for (const msg of convo.messages) {
      if (msg.label === "human" || msg.label === "ai") {
        history.push({ label: msg.label, content: msg.content });
      }
    }
  }
  return history;
}

function toBaseMessages(history: HistoryMessage[]): BaseMessage[] {
  return history.map((m) =>
    m.label === "human"
      ? new HumanMessage(m.content)
      : new AIMessage(m.content),
  );
}

/* ------------------------------------------------------------------ */
/* Activity 1: load context (DB reads only)                            */
/* ------------------------------------------------------------------ */

export async function loadContextActivity(input: {
  tripId: string;
  userId: string;
}): Promise<LoadedContext> {
  const rawTripId = toRawTripId(input.tripId);

  // Permanent input errors must not be retried.
  if (!rawTripId || !mongoose.Types.ObjectId.isValid(rawTripId)) {
    throw ApplicationFailure.nonRetryable("Invalid tripId", "InvalidInput");
  }

  // DB failures here are transient, so they propagate and Temporal retries.
  const [conversations, savedTrip] = await Promise.all([
    getChatByTripIdService(rawTripId, input.userId),
    loadSavedTrip(rawTripId),
  ]);

  return { history: flattenHistory(conversations), savedTrip };
}

/* ------------------------------------------------------------------ */
/* Activity 2: run the LLM graph (no DB writes, so it is safe to retry)*/
/* ------------------------------------------------------------------ */

export async function runGraphActivity(input: {
  query: string;
  history: HistoryMessage[];
  savedTrip: Record<string, any> | null;
}): Promise<RunGraphResult> {
  // Linear graph (planner -> executor -> composer -> finalizer), no cycles.
  // Planner and composer only read the last 16 messages of history.
  const result = await assistantGraph.invoke(
    {
      messages: [
        ...toBaseMessages(input.history),
        new HumanMessage(input.query),
      ],
      savedTrip: input.savedTrip,
    },
    { recursionLimit: 25 },
  );

  // Return only what callers need. The full graph state is large, not cleanly
  // serialisable, and can exceed Temporal's payload limit.
  return {
    conversation: result.conversation ?? null,
    reply: result.conversation?.messages?.[1]?.content ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* Activity 3: persist the chat (DB write only)                        */
/* ------------------------------------------------------------------ */

export async function saveChatActivity(input: {
  tripId: string;
  conversation: Conversation;
}): Promise<void> {
  await appendConversationService(
    toRawTripId(input.tripId),
    input.conversation,
  );
}
