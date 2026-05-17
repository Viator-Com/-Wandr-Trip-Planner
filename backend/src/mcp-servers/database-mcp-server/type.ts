import { Types } from "mongoose";

/* ---------- Enums ---------- */

export type ActivityCategory =
  | "food"
  | "transport"
  | "sightseeing"
  | "accommodation"
  | "leisure"
  | "shopping"
  | "other";

export type ActivityStatus = "planned" | "confirmed" | "cancelled";

export type TripStatus = "planning" | "upcoming" | "ongoing" | "completed";

export type TripVisibility = "private" | "shared" | "public";

/* ---------- Core Types ---------- */

export type Coordinates = {
  lat: number;
  lng: number;
};

export type Traveler = {
  name: string;
  userId?: Types.ObjectId | string;
};

/* ---------- Activity ---------- */

export type ItineraryActivity = {
  description?: string;
  place?: string;
  coordinates?: Coordinates;
  category?: ActivityCategory;
  status?: ActivityStatus;
  startTime?: string; // "HH:mm"
  endTime?: string;
  cost?: number;
  bookingReference?: string;
  notes?: string;
};

/* ---------- Itinerary Day ---------- */

export type ItineraryDay = {
  day: number;
  date: string; // ISO string (frontend friendly)
  title?: string;
  accommodation?: string;
  estimatedCost?: number;
  activities: ItineraryActivity[];
};

/* ---------- Trip ---------- */

export type Trip = {
  _id: string;

  userId: Types.ObjectId | string;

  title: string;
  destination: string;

  startDate: string;
  endDate: string;

  timezone: string;

  status: TripStatus;
  visibility: TripVisibility;

  budget: number;
  totalSpent: number;

  currency: string;

  coverImage?: string;

  travelers: Traveler[];
  tags: string[];

  itinerary: ItineraryDay[];

  createdAt: string;
  updatedAt: string;
};

/* ---------- API Results ---------- */

export type TripResult = {
  trip: Trip | null;
};

/* ---------- Create Payload ---------- */

export type CreateTripPayload = {
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  timezone?: string;
  budget: number;
  currency: string;
  travelers?: Traveler[];
  tags?: string[];
};

/* ---------- Update Payload ---------- */

export type UpdateTripPayload = Partial<
  Omit<Trip, "_id" | "userId" | "createdAt" | "updatedAt">
>;

/* ---------- Itinerary Updates ---------- */

export type ItineraryDayUpdate = {
  day: number;
  date?: string;
  title?: string;
  accommodation?: string;
  estimatedCost?: number;
  activities?: ItineraryActivity[];
};
