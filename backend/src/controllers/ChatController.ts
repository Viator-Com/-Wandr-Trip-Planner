import type { Request, Response } from "express";
import { Types } from "mongoose";
import { Chat } from "../models/chat.schema.js";
import { getChatByTripIdService } from "../services/getChatByTripIdService.js";
import { appendConversationService } from "../services/appendConversationservice.js";
import type { AuthRequest } from "../types/express.js";

/* ─────────────────────────────────────────
   Helpers
───────────────────────────────────────── */

/** Send a consistently-shaped error response. */
const sendError = (res: Response, status: number, message: string) =>
  res.status(status).json({ status: status < 500 ? "fail" : "error", message });

/** Return true if `id` is a valid 24-char Mongo ObjectId. */
const isValidObjectId = (id: string) => Types.ObjectId.isValid(id);

/* ─────────────────────────────────────────
   GET chat by tripId
───────────────────────────────────────── */

export const getChatByTripId = async (req: AuthRequest, res: Response) => {
  const tripId = req.params.tripId as string;

  if (!tripId || !isValidObjectId(tripId)) {
    return sendError(res, 400, "The provided trip ID is not valid");
  }

  if (!req.user?._id) {
    return sendError(res, 401, "You must be logged in to view chat");
  }

  try {
    const chats = await getChatByTripIdService(tripId, req.user._id);

    return res.status(200).json({
      status: "success",
      data: chats,
    });
  } catch (error: any) {
    console.error("[getChatByTripId]", error);
    const statusCode = error.statusCode ?? 500;
    return sendError(
      res,
      statusCode,
      statusCode < 500
        ? error.message
        : "Something went wrong while fetching the chat",
    );
  }
};

/* ─────────────────────────────────────────
   Create chat if not exists & append ONE conversation
───────────────────────────────────────── */

export const appendConversation = async (req: Request, res: Response) => {
  const tripId = req.params.tripId as string;

  if (!tripId || !isValidObjectId(tripId)) {
    return sendError(res, 400, "The provided trip ID is not valid");
  }

  const { conversation } = req.body;

  if (!conversation) {
    return sendError(res, 400, "A conversation payload is required");
  }

  try {
    const chat = await appendConversationService(tripId, conversation);

    return res.status(201).json({
      status: "success",
      data: chat,
    });
  } catch (error: any) {
    console.error("[appendConversation]", error);
    const statusCode = error.statusCode ?? 500;
    return sendError(
      res,
      statusCode,
      statusCode < 500
        ? error.message
        : "Something went wrong while saving the conversation",
    );
  }
};
