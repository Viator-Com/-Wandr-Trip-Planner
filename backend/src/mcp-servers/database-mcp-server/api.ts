import axios from "axios";
import { Trip, TripResult } from "./type.js";
import { getTripByIdService } from "../../services/getTripByIdService.js";
const BASE_URL = "http://localhost:3000/api/trips";

export async function fetchTrip(tripId: string): Promise<TripResult | null> {
  try {
    const res = await getTripByIdService(tripId);

    if (!res) return { trip: null };

    return {
      trip: {
        ...res,
        _id: res._id.toString(),
        userId: res.userId.toString(),
        startDate:
          res.startDate instanceof Date
            ? res.startDate.toISOString()
            : res.startDate,
        endDate:
          res.endDate instanceof Date ? res.endDate.toISOString() : res.endDate,
        createdAt:
          res.createdAt instanceof Date
            ? res.createdAt.toISOString()
            : res.createdAt,
        updatedAt:
          res.updatedAt instanceof Date
            ? res.updatedAt.toISOString()
            : res.updatedAt,
      } as unknown as Trip,
    };
  } catch (err: any) {
    console.error(err.message);
    return null;
  }
}
