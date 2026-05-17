import { Trip } from "../models/trip.schema.js";
import mongoose from "mongoose";

export const getTripByIdService = async (tripId: string) => {
  if (!tripId) {
    throw new Error("Trip ID is required");
  }
  console.error("JIIII", tripId);
  await mongoose.connect(process.env.MONGO_URI!);
  console.error("MongoDB connected in fetch trip tool");
  const trip = await Trip.findById(tripId).lean();

  if (!trip) {
    throw new Error("No trip found with this ID");
  }

  return trip;
};
