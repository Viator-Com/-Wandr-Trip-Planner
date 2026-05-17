import { Chat } from "../models/chat.schema.js";

type Message = {
  label: "human" | "ai";
  content: string;
  timestamp?: Date;
};

type Conversation = {
  messages: Message[];
  workflowId?: string;
};

export async function appendConversationService(
  tripId: string,
  conversation: Conversation,
) {
  if (
    !conversation ||
    !Array.isArray(conversation.messages) ||
    conversation.messages.length < 2
  ) {
    throw new Error("conversation.messages must contain at least 2 messages");
  }

  // Group messages into human+ai pairs
  const pairs: [Message, Message][] = [];

  for (let i = 0; i < conversation.messages.length - 1; i++) {
    const current = conversation.messages[i];
    const next = conversation.messages[i + 1];

    if (current.label === "human" && next.label === "ai") {
      pairs.push([current, next]);
      i++; // skip the ai message we just consumed
    }
  }

  if (pairs.length === 0) {
    throw new Error("No valid human → ai message pairs found");
  }

  const conversationDocs = pairs.map(([human, ai]) => ({
    messages: [
      {
        label: "human",
        content: human.content,
        timestamp: human.timestamp ?? new Date(),
      },
      {
        label: "ai",
        content: ai.content,
        timestamp: ai.timestamp ?? new Date(),
      },
    ],
    workflowId: conversation.workflowId,
  }));

  const chat = await Chat.findOneAndUpdate(
    { tripId },
    {
      $setOnInsert: { tripId },
      $push: {
        conversations: { $each: conversationDocs },
      },
    },
    {
      new: true,
      upsert: true,
      runValidators: true,
    },
  );

  return chat;
}
