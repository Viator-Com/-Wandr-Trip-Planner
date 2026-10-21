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
// TODO: point this at whatever your db MCP server's `fetch-trip-from-database` tool called internally.
import { getTripByIdService } from "../../../services/getTripByIdService.js";

// Re-exported so existing imports of these types from this file keep working.
export type { ChatMessage, ChatRole, Conversation };

export async function saveConversations(
  tripId: string,
  conversation: Conversation,
) {
  return await appendConversationService(tripId, conversation);
}

export async function loadConversations(tripId: string, userId: string) {
  try {
    if (!tripId || typeof tripId !== "string") {
      throw new Error("No tripId or tripId is not a string");
    }

    if (!mongoose.Types.ObjectId.isValid(tripId)) {
      throw new Error("Invalid tripId");
    }

    const chats = await getChatByTripIdService(tripId, userId);

    return chats;
  } catch (error: any) {
    console.error("FROM loadConversations activity:", error.message);
    throw error;
  }
}

/**
 * Loads the saved trip as plain JSON to push into the graph state.
 * A missing or failing trip must never fail the user's question, so errors become null.
 */
export async function loadSavedTrip(
  tripId: string,
  userId: string,
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

function buildHistory(
  conversations: {
    messages: {
      label: "human" | "ai";
      content: string;
    }[];
  }[],
): BaseMessage[] {
  const history: BaseMessage[] = [];

  for (const convo of conversations) {
    for (const msg of convo.messages) {
      if (msg.label === "human") {
        history.push(new HumanMessage(msg.content));
      } else if (msg.label === "ai") {
        history.push(new AIMessage(msg.content));
      }
    }
  }

  return history;
}

export async function runAssistantGraph(input: {
  query: string;
  tripId: string;
  userId: string;
}) {
  const { query, tripId, userId } = input;
  const rawTripId = tripId.replace("assistant-", "");
  const [conversations, savedTrip] = await Promise.all([
    loadConversations(rawTripId, userId),
    loadSavedTrip(rawTripId, userId),
  ]);

  const historyMessages = buildHistory(conversations);

  // Linear graph (planner -> executor -> composer -> finalizer), no cycles.
  // Planner and composer only read the last 16 messages of history.
  const result = await assistantGraph.invoke(
    {
      messages: [...historyMessages, new HumanMessage(query)],
      savedTrip,
    },
    {
      recursionLimit: 25,
    },
  );

  if (result.conversation) {
    // Saving the chat must never fail the user's request.
    try {
      await saveConversations(rawTripId, result.conversation);
    } catch (error: any) {
      console.error(
        "[runAssistantGraph] saveConversations failed:",
        error?.message ?? error,
      );
    }
  }

  // Return only what callers need. The full graph state (LangChain message objects,
  // raw findings) is large, not cleanly serialisable, and can exceed Temporal's payload limit.
  return {
    conversation: result.conversation ?? null,
    reply: result.conversation?.messages?.[1]?.content ?? null,
  };
}
