import axios from "axios";
import type { ITrip, IItineraryDay } from "./types";

const API = "http://localhost:3000/api";
const cfg = { withCredentials: true };

export async function getTrips(): Promise<ITrip[]> {
  try {
    const res = await axios.get(`${API}/trips/usertrips`, cfg);
    return res.data.data.map((t: ITrip) => ({ ...t, _id: String(t._id) }));
  } catch (err: any) {
    throw new Error(err?.response?.data?.message ?? "Failed to fetch trips");
  }
}

export async function createTrip(data: unknown): Promise<ITrip> {
  try {
    const res = await axios.post(`${API}/trips`, data, cfg);
    return { ...res.data.trip, _id: String(res.data.trip._id) };
  } catch (err: any) {
    throw new Error(err?.response?.data?.message ?? "Failed to create trip");
  }
}

export async function fetchTrip(tripId: string): Promise<ITrip> {
  try {
    const res = await axios.get(`${API}/trips/${tripId}`, cfg);
    return { ...res.data.trip, _id: String(res.data.trip._id) };
  } catch (err: any) {
    throw new Error(err?.response?.data?.message ?? "Failed to fetch trip");
  }
}

export async function updateTripFields(
  tripId: string,
  fields: Partial<Omit<ITrip, "_id" | "itinerary" | "userId">>,
): Promise<ITrip> {
  try {
    const res = await axios.patch(`${API}/trips/${tripId}`, fields, cfg);
    return { ...res.data.trip, _id: String(res.data.trip._id) };
  } catch (err: any) {
    throw new Error(err?.response?.data?.message ?? "Failed to update trip");
  }
}

export async function updateTripItinerary(
  tripId: string,
  itinerary: IItineraryDay[],
): Promise<ITrip> {
  try {
    const res = await axios.patch(
      `${API}/trips/${tripId}/itinerary`,
      { itinerary },
      cfg,
    );
    return { ...res.data.trip, _id: String(res.data.trip._id) };
  } catch (err: any) {
    throw new Error(
      err?.response?.data?.message ?? "Failed to update itinerary",
    );
  }
}

export async function deleteTrip(tripId: string): Promise<void> {
  try {
    await axios.delete(`${API}/trips/${tripId}`, cfg);
  } catch (err: any) {
    throw new Error(err?.response?.data?.message ?? "Failed to delete trip");
  }
}
