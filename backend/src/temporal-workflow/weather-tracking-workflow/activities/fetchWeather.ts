import axios from "axios";
import { ApplicationFailure, log } from "@temporalio/activity";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });

import {
  FetchWeatherInput,
  WeatherResult,
  WeatherSeverity,
  WeatherSensitivity,
} from "../type.js";

// ─── Thresholds ───────────────────────────────────────────────────────────────

const SENSITIVITY_THRESHOLDS: Record<WeatherSensitivity, number> = {
  low: 8,
  medium: 5,
  high: 2,
};

// ─── Weather code metadata ────────────────────────────────────────────────────

interface WeatherCodeMeta {
  description: string;
  type: string; // category label
  baseScore: number; // 0–9, condition severity ignoring sensor values
}

const WEATHER_CODE_META: Record<number, WeatherCodeMeta> = {
  1000: { description: "clear sky", type: "clear", baseScore: 0 },
  1100: { description: "mostly clear", type: "clear", baseScore: 0 },
  1101: { description: "partly cloudy", type: "cloudy", baseScore: 1 },
  1102: { description: "mostly cloudy", type: "cloudy", baseScore: 1 },
  1001: { description: "cloudy", type: "cloudy", baseScore: 1 },
  2000: { description: "fog", type: "fog", baseScore: 4 },
  2100: { description: "light fog", type: "fog", baseScore: 3 },
  4000: { description: "drizzle", type: "rain", baseScore: 2 },
  4001: { description: "rain", type: "rain", baseScore: 5 },
  4200: { description: "light rain", type: "rain", baseScore: 3 },
  4201: { description: "heavy rain", type: "rain", baseScore: 6 },
  5000: { description: "snow", type: "snow", baseScore: 6 },
  5001: { description: "flurries", type: "snow", baseScore: 5 },
  5100: { description: "light snow", type: "snow", baseScore: 4 },
  5101: { description: "heavy snow", type: "snow", baseScore: 8 },
  6000: {
    description: "freezing drizzle",
    type: "freezing_rain",
    baseScore: 6,
  },
  6001: { description: "freezing rain", type: "freezing_rain", baseScore: 7 },
  6200: {
    description: "light freezing rain",
    type: "freezing_rain",
    baseScore: 6,
  },
  6201: {
    description: "heavy freezing rain",
    type: "freezing_rain",
    baseScore: 8,
  },
  7000: { description: "ice pellets", type: "ice", baseScore: 7 },
  7101: { description: "heavy ice pellets", type: "ice", baseScore: 8 },
  7102: { description: "light ice pellets", type: "ice", baseScore: 6 },
  8000: { description: "thunderstorm", type: "thunderstorm", baseScore: 9 },
};

const FALLBACK_META: WeatherCodeMeta = {
  description: "unknown conditions",
  type: "unknown",
  baseScore: 0,
};

// ─── Scoring ──────────────────────────────────────────────────────────────────

interface SensorValues {
  temperature?: number; // °C
  windSpeed?: number; // m/s
  humidity?: number; // %
  visibility?: number; // km
  precipitationIntensity?: number; // mm/hr
}

interface ScoreBreakdown {
  base: number;
  wind: number;
  temperature: number;
  precipitation: number;
  visibility: number;
  total: number;
  reasons: string[];
}

function scoreWindSpeed(windSpeed?: number): {
  score: number;
  reason: string | null;
} {
  if (windSpeed == null) return { score: 0, reason: null };
  // Beaufort-inspired thresholds (m/s)
  if (windSpeed >= 28.5)
    return { score: 5, reason: `violent storm winds (${windSpeed} m/s)` };
  if (windSpeed >= 20.8)
    return { score: 4, reason: `storm-force winds (${windSpeed} m/s)` };
  if (windSpeed >= 13.9)
    return { score: 3, reason: `strong winds (${windSpeed} m/s)` };
  if (windSpeed >= 7.9)
    return { score: 2, reason: `moderate winds (${windSpeed} m/s)` };
  if (windSpeed >= 3.4) return { score: 1, reason: null };
  return { score: 0, reason: null };
}

function scoreTemperature(temp?: number): {
  score: number;
  reason: string | null;
} {
  if (temp == null) return { score: 0, reason: null };
  if (temp >= 45) return { score: 5, reason: `extreme heat (${temp}°C)` };
  if (temp >= 40) return { score: 4, reason: `dangerous heat (${temp}°C)` };
  if (temp >= 35) return { score: 2, reason: `high temperature (${temp}°C)` };
  if (temp <= -20) return { score: 5, reason: `extreme cold (${temp}°C)` };
  if (temp <= -10) return { score: 4, reason: `severe cold (${temp}°C)` };
  if (temp <= 0)
    return { score: 2, reason: `freezing temperature (${temp}°C)` };
  return { score: 0, reason: null };
}

function scorePrecipitation(intensity?: number): {
  score: number;
  reason: string | null;
} {
  if (intensity == null) return { score: 0, reason: null };
  if (intensity >= 50)
    return { score: 4, reason: `extreme precipitation (${intensity} mm/hr)` };
  if (intensity >= 20)
    return { score: 3, reason: `heavy precipitation (${intensity} mm/hr)` };
  if (intensity >= 7)
    return { score: 2, reason: `moderate precipitation (${intensity} mm/hr)` };
  if (intensity >= 2) return { score: 1, reason: null };
  return { score: 0, reason: null };
}

function scoreVisibility(visibility?: number): {
  score: number;
  reason: string | null;
} {
  if (visibility == null) return { score: 0, reason: null };
  if (visibility <= 0.1)
    return { score: 4, reason: `near-zero visibility (${visibility} km)` };
  if (visibility <= 0.5)
    return { score: 3, reason: `very low visibility (${visibility} km)` };
  if (visibility <= 1)
    return { score: 2, reason: `low visibility (${visibility} km)` };
  if (visibility <= 3) return { score: 1, reason: null };
  return { score: 0, reason: null };
}

function computeScore(baseScore: number, values: SensorValues): ScoreBreakdown {
  const wind = scoreWindSpeed(values.windSpeed);
  const temperature = scoreTemperature(values.temperature);
  const precip = scorePrecipitation(values.precipitationIntensity);
  const vis = scoreVisibility(values.visibility);

  const reasons: string[] = [
    wind.reason,
    temperature.reason,
    precip.reason,
    vis.reason,
  ].filter(Boolean) as string[];

  // Cap total at 10 — base + compound modifiers
  const total = Math.min(
    10,
    baseScore + wind.score + temperature.score + precip.score + vis.score,
  );

  return {
    base: baseScore,
    wind: wind.score,
    temperature: temperature.score,
    precipitation: precip.score,
    visibility: vis.score,
    total,
    reasons,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function deriveSeverity(total: number): WeatherSeverity {
  if (total >= 7) return "high";
  if (total >= 4) return "medium";
  return "low";
}

function buildMessage(
  place: string,
  description: string,
  values: SensorValues,
  reasons: string[],
): string {
  const parts: string[] = [`Weather alert at ${place}: ${description}.`];

  if (values.temperature != null)
    parts.push(`Temperature: ${values.temperature}°C.`);
  if (values.windSpeed != null) parts.push(`Wind: ${values.windSpeed} m/s.`);
  if (values.humidity != null) parts.push(`Humidity: ${values.humidity}%.`);
  if (values.visibility != null)
    parts.push(`Visibility: ${values.visibility} km.`);
  if (values.precipitationIntensity != null)
    parts.push(`Precipitation: ${values.precipitationIntensity} mm/hr.`);

  if (reasons.length > 0) parts.push(`Risk factors: ${reasons.join(", ")}.`);

  return parts.join(" ");
}

// ─── Main activity ────────────────────────────────────────────────────────────

export async function fetchWeather(
  input: FetchWeatherInput,
): Promise<WeatherResult> {
  const { latitude, longitude, place, sensitivity } = input;

  log.info("Fetching weather", { place, latitude, longitude, sensitivity });

  let res;
  try {
    res = await axios.get("https://api.tomorrow.io/v4/weather/realtime", {
      params: {
        location: `${latitude},${longitude}`,
        apikey: process.env.TOMORROWIO_API_KEY,
        units: "metric",
      },
      timeout: 15000,
    });
  } catch (err: any) {
    const status = err.response?.status;
    if (status === 401 || status === 403) {
      throw ApplicationFailure.nonRetryable(
        "Tomorrow.io authentication failed – check TOMORROW_IO_API_KEY",
        "WEATHER_AUTH_ERROR",
      );
    }
    throw new Error(
      `Weather API request failed (HTTP ${status ?? "network error"}): ${err.message}`,
    );
  }

  const raw = res.data?.data?.values ?? {};

  const values: SensorValues = {
    temperature: raw.temperature,
    windSpeed: raw.windSpeed,
    humidity: raw.humidity,
    visibility: raw.visibility,
    precipitationIntensity: raw.precipitationIntensity,
  };

  const weatherCode: number = raw.weatherCode ?? 1000;
  const meta = WEATHER_CODE_META[weatherCode] ?? FALLBACK_META;
  const breakdown = computeScore(meta.baseScore, values);
  const severity = deriveSeverity(breakdown.total);
  const threshold = SENSITIVITY_THRESHOLDS[sensitivity];
  const critical = breakdown.total >= threshold;

  const message =
    critical || breakdown.total >= 4
      ? buildMessage(place, meta.description, values, breakdown.reasons)
      : `Current conditions at ${place}: ${meta.description}, ${values.temperature ?? "?"}°C.`;

  log.info("Weather evaluated", {
    place,
    weatherCode,
    scoreBreakdown: breakdown,
    severity,
    critical,
    threshold,
  });

  return {
    critical,
    severity,
    message,
    type: meta.type,
    temperature: values.temperature,
    windSpeed: values.windSpeed,
    humidity: values.humidity,
    fetchedAt: new Date().toISOString(),
  };
}
