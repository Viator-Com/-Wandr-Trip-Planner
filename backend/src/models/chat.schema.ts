import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      enum: ["human", "ai"],
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    timestamp: {
      type: Date,
      required: true,
    },
  },
  { _id: false },
);

const conversationSchema = new mongoose.Schema(
  {
    messages: {
      type: [messageSchema],
      required: true,
      validate: {
        validator: (msgs: any[]) =>
          msgs.length === 2 &&
          msgs[0].label === "human" &&
          msgs[1].label === "ai",
        message: "Conversation must have exactly one human and one ai message",
      },
    },
  },
  { _id: false },
);

const chatSchema = new mongoose.Schema(
  {
    tripId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
      unique: true,
    },

    conversations: {
      type: [conversationSchema],
      default: [],
    },
  },
  { timestamps: true },
);

export const Chat = mongoose.model("Chat", chatSchema);
