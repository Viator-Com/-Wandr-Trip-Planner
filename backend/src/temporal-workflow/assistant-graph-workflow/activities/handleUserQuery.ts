import {
  assistantGraph,
  buildRouterGraph,
} from "../../../langgraph_mcp/index.js";
import {
  HumanMessage,
  AIMessage,
  BaseMessage,
  SystemMessage,
} from "@langchain/core/messages";
import mongoose from "mongoose";
import { getChatByTripIdService } from "../../../services/getChatByTripIdService.js";
import { appendConversationService } from "../../../services/appendConversationservice.js";

export type ChatRole = "ai" | "human";

export interface ChatMessage {
  label: ChatRole;
  content: string;
  timestamp?: Date;
}
export type Conversation = {
  messages: [ChatMessage, ChatMessage]; // human, ai
};

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
  const conversations = await loadConversations(rawTripId, userId);

  const historyMessages = buildHistory(conversations);

  // await buildRouterGraph.invoke({});

  const result = await assistantGraph.invoke(
    {
      messages: [...historyMessages, new HumanMessage(query)],
    },
    {
      configurable: {
        tripId: rawTripId,
      },
    },
  );

  console.error(result.conversation);
  if (result.conversation) saveConversations(rawTripId, result.conversation);
  return result;
}
