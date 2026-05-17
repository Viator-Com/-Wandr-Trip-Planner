// ─── Geo ────────────────────────────────────────────────────────────────────

export interface Coordinates {
  latitude: number;
  longitude: number;
}

// ─── Itinerary ───────────────────────────────────────────────────────────────

export type WeatherSensitivity = "low" | "medium" | "high";

export interface ItineraryActivity {
  place: string;
  coordinates: Coordinates;
  startDateTime: string; // ISO-8601
  endDateTime: string; // ISO-8601
  weatherSensitivity?: WeatherSensitivity;
}

// ─── Trip ────────────────────────────────────────────────────────────────────

export type TripStatus = "planned" | "active" | "completed" | "cancelled";

export interface Trip {
  _id: string;
  userId: string;
  title: string;
  status: TripStatus;
  itinerary: ItineraryActivity[];
  createdAt: string;
  updatedAt: string;
}

// ─── Weather ─────────────────────────────────────────────────────────────────

export type WeatherSeverity = "low" | "medium" | "high";

export interface WeatherResult {
  critical: boolean;
  severity: WeatherSeverity;
  message: string;
  type: string;
  temperature?: number;
  windSpeed?: number;
  humidity?: number;
  fetchedAt: string;
}

// ─── Activity Inputs / Outputs ───────────────────────────────────────────────

export interface FetchWeatherInput {
  latitude: number;
  longitude: number;
  sensitivity: WeatherSensitivity;
  place: string;
}

export interface SendWeatherAlertInput {
  subject: string;
  email: string;
  message: string;
}

export interface SendWeatherAlertResult {
  alertId: string;
  sentAt: string;
  channel: string;
}

// ─── Dedup Key ───────────────────────────────────────────────────────────────

export interface AlertDeduplicationKey {
  type: string;
  severity: WeatherSeverity;
  place: string;
}
