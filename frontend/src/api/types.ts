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

export interface ICoordinates {
  lat: number;
  lng: number;
}
export interface ITraveler {
  name: string;
  userId?: string;
}

export interface IItineraryActivity {
  description?: string;
  place?: string;
  coordinates?: ICoordinates;
  category?: ActivityCategory;
  status: ActivityStatus;
  startTime?: string;
  endTime?: string;
  cost?: number;
  bookingReference?: string;
  notes?: string;
}

export interface IItineraryDay {
  day: number;
  date: Date;
  title?: string;
  accommodation?: string;
  estimatedCost?: number;
  activities: IItineraryActivity[];
}

export interface ITrip {
  _id: string;
  userId: string;
  title: string;
  destination: string;
  startDate: Date;
  endDate: Date;
  timezone: string;
  status: TripStatus;
  visibility: TripVisibility;
  budget: number;
  totalSpent: number;
  currency: string;
  travelers: ITraveler[];
  tags: string[];
  itinerary: IItineraryDay[];
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  badge: string;
  avatarInitial: string;
}

export interface ApiResponse<T = undefined> {
  success: boolean;
  message: string;
  data?: T;
}
