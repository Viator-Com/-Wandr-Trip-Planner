import { Trip } from "../models/trip.schema.js";
import { Chat } from "../models/chat.schema.js";

export async function getChatByTripIdService(tripId: string, userId: any) {
  if (!tripId) {
    throw new Error("tripId is not present");
  }

  const trip = await Trip.findById(tripId);

  if (!trip) {
    throw new Error("Trip not found for this tripId");
  }

  if (!trip.userId.equals(userId)) {
    const err: any = new Error("You are not authorized to access this trip");
    err.statusCode = 403;
    throw err;
  }

  const chat = await Chat.findOne({ tripId }).lean();
  return chat?.conversations ?? [];
}
