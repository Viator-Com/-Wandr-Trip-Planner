import {
  defineSignal,
  defineQuery,
  setHandler,
  proxyActivities,
  log,
  workflowInfo,
  continueAsNew,
  condition,
} from "@temporalio/workflow";

import * as getTripActivity from "./activities/getTripById.js";
import * as weatherActivity from "./activities/fetchWeather.js";
import * as sendAlertActivity from "./activities/sendWeatherAlert.js";

import type {
  ActivityCategory,
  IItineraryDay,
  ITrip,
} from "../../models/trip.schema.js";

// ─── Activity Proxies ─────────────────────────────────────────────────────────

const { getTripById } = proxyActivities<typeof getTripActivity>({
  scheduleToStartTimeout: "1 minute",
  startToCloseTimeout: "2 minutes",
  retry: {
    initialInterval: "5s",
    backoffCoefficient: 2,
    maximumInterval: "60s",
    maximumAttempts: 5,
  },
});

const { fetchWeather } = proxyActivities<typeof weatherActivity>({
  scheduleToStartTimeout: "1 minute",
  startToCloseTimeout: "2 minutes",
  heartbeatTimeout: "30s", // detects dead worker within 30s
  retry: {
    initialInterval: "5s",
    backoffCoefficient: 2,
    maximumInterval: "60s",
    maximumAttempts: 5,
  },
});

const { sendWeatherAlert } = proxyActivities<typeof sendAlertActivity>({
  scheduleToStartTimeout: "1 minute",
  startToCloseTimeout: "2 minutes",
  retry: {
    initialInterval: "5s",
    backoffCoefficient: 2,
    maximumInterval: "30s",
    maximumAttempts: 3,
  },
});

// ─── Signals & Queries ────────────────────────────────────────────────────────

export const cancelTripSignal = defineSignal("cancelTrip");
export const updateItinerarySignal =
  defineSignal<[IItineraryDay[]]>("updateItinerary");
export const getStatusQuery = defineQuery<WorkflowStatus>("getStatus");

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WorkflowInput {
  tripId: string;
  itinerary?: IItineraryDay[]; // carried forward by continueAsNew
  resumeDayIdx?: number;
  resumeActIdx?: number;
  alertsSent?: number;
}

interface WorkflowStatus {
  tripId: string;
  currentDay: number;
  currentPlace: string;
  alertsSent: number;
  isCancelled: boolean;
}

interface PendingUpdate {
  itinerary: IItineraryDay[];
  version: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const POLL_NORMAL_MS = 60 * 60 * 1_000; // 1 hour  — calm weather
const POLL_CRITICAL_MS = 15 * 60 * 1_000; // 15 mins — active alert
const MIN_SLEEP_MS = 1_000; // never call sleep(0) or sleep(-n)
const HISTORY_LIMIT = 10_000; // roll over before Temporal's 50k cap

// Categories worth monitoring — skip indoor ones (accommodation, shopping)
const WEATHER_SENSITIVE = new Set<ActivityCategory | undefined>([
  "sightseeing",
  "leisure",
  "food",
  "transport",
  "other",
  undefined,
]);

// ─── Workflow ─────────────────────────────────────────────────────────────────

export async function WeatherTrackingWorkflow(
  input: WorkflowInput,
): Promise<void> {
  const {
    tripId,
    resumeDayIdx = 0,
    resumeActIdx = 0,
    alertsSent: prevAlerts = 0,
  } = input;

  const { workflowId } = workflowInfo();
  log.info("Workflow started", {
    workflowId,
    tripId,
    resumeDayIdx,
    resumeActIdx,
  });

  // ── Mutable state ───────────────────────────────────────────────────────────

  let isCancelled = false;
  let pendingUpdate: PendingUpdate | null = null;
  let appliedVersion = 0;
  let currentDay = resumeDayIdx;
  let currentPlace = "loading";
  let alertsSent = prevAlerts;

  // ── Signal handlers ─────────────────────────────────────────────────────────

  setHandler(cancelTripSignal, () => {
    log.info("cancelTrip received", { workflowId, tripId });
    isCancelled = true;
  });

  setHandler(updateItinerarySignal, (days: IItineraryDay[]) => {
    // Version counter prevents silent overwrite when two signals arrive
    // before the loop reads pendingUpdate
    const version = (pendingUpdate?.version ?? appliedVersion) + 1;
    pendingUpdate = { itinerary: days, version };
    log.info("Itinerary update queued", { version, dayCount: days.length });
  });

  // ── Query handler — lets you inspect the live workflow from outside ──────────

  setHandler(getStatusQuery, () => ({
    tripId,
    currentDay,
    currentPlace,
    alertsSent,
    isCancelled,
  }));

  // ── Load trip ────────────────────────────────────────────────────────────────

  const trip: ITrip = await getTripById(tripId);
  const timezone = trip.timezone ?? "UTC";

  // Use itinerary carried forward from continueAsNew, else load fresh
  let itinerary: IItineraryDay[] = input.itinerary ?? [...trip.itinerary];

  // ── Day loop ─────────────────────────────────────────────────────────────────

  while (currentDay < itinerary.length) {
    // ── History guard ─────────────────────────────────────────────────────────
    // Temporal caps history at ~50k events. We roll over at 10k carrying all
    // state forward so the workflow continues seamlessly in a fresh execution.

    if (workflowInfo().historyLength > HISTORY_LIMIT) {
      log.info("History limit reached – continuing as new");
      await continueAsNew<typeof WeatherTrackingWorkflow>({
        tripId,
        itinerary,
        resumeDayIdx: currentDay,
        resumeActIdx: 0,
        alertsSent,
      });
      return;
    }

    // ── Cancellation ──────────────────────────────────────────────────────────

    if (isCancelled) {
      log.info("Cancelled – exiting", { tripId });
      return;
    }

    // ── Apply itinerary update ────────────────────────────────────────────────

    if (pendingUpdate !== null) {
      const update = pendingUpdate as PendingUpdate;
      itinerary = [...update.itinerary];
      appliedVersion = update.version;
      pendingUpdate = null;

      console.log(itinerary);

      const resume = firstRelevantDay(itinerary, timezone);
      log.info("Itinerary applied", {
        appliedVersion,
        resumeDay: resume,
      });

      if (resume === -1) {
        log.info("No future activities in updated itinerary – done");
        return;
      }

      currentDay = resume;
      continue;
    }

    // ── Validate day ──────────────────────────────────────────────────────────

    const day = itinerary[currentDay];

    if (!day || !Array.isArray(day.activities) || day.activities.length === 0) {
      log.info("Skipping empty day", { dayIndex: currentDay });
      currentDay++;
      continue;
    }

    if (isDayFullyElapsed(day, timezone)) {
      log.info("Skipping elapsed day", { day: day.day, date: day.date });
      currentDay++;
      continue;
    }

    log.info("Processing day", { day: day.day, date: day.date });

    // ── Activity loop (within the day) ────────────────────────────────────────

    const startActIdx = currentDay === resumeDayIdx ? resumeActIdx : 0;

    for (let ai = startActIdx; ai < day.activities.length; ai++) {
      if (isCancelled) return;
      if (pendingUpdate !== null) break; // outer loop applies the update

      const activity = day.activities[ai];

      // ── Filter: skip cancelled or indoor activities ────────────────────────

      if (activity.status === "cancelled") {
        log.info("Skipping cancelled activity", { place: activity.place });
        continue;
      }

      if (!WEATHER_SENSITIVE.has(activity.category)) {
        log.info("Skipping indoor activity", {
          place: activity.place,
          category: activity.category,
        });
        continue;
      }

      if (!activity.coordinates) {
        log.warn("Skipping activity without coordinates", {
          place: activity.place,
        });
        continue;
      }

      // ── Build full epoch ms from day.date + "HH:mm" + timezone ───────────

      const startMs = toEpochMs(day.date, activity.startTime, timezone);
      const endMs = toEpochMs(day.date, activity.endTime, timezone);

      if (startMs === null || endMs === null) {
        log.warn("Skipping activity – missing or invalid times", {
          place: activity.place,
          startTime: activity.startTime,
          endTime: activity.endTime,
        });
        continue;
      }

      if (startMs >= endMs) {
        log.warn("Skipping activity – startTime >= endTime", {
          place: activity.place,
        });
        continue;
      }

      if (endMs <= Date.now()) {
        log.info("Skipping elapsed activity", { place: activity.place });
        continue;
      }

      // ── Wait for activity to start ─────────────────────────────────────────
      // condition() wakes immediately on a signal instead of sleeping blindly

      if (startMs > Date.now()) {
        currentPlace = `waiting: ${activity.place ?? "unknown"}`;
        log.info("Waiting for activity to begin", {
          place: activity.place,
          startTime: activity.startTime,
        });

        const signalArrived = await condition(
          () => isCancelled || pendingUpdate !== null,
          startMs - Date.now(),
        );

        if (signalArrived) break; // re-enter outer loop to handle signal
      }

      // ── Monitor weather for the activity window ────────────────────────────

      currentPlace = activity.place ?? "unknown place";
      log.info("Monitoring started", {
        place: activity.place,
        day: day.day,
        startTime: activity.startTime,
        endTime: activity.endTime,
        category: activity.category,
      });

      let lastAlertKey = ""; // reset per-activity — never bleed across activities

      while (Date.now() < endMs) {
        if (isCancelled) return;
        if (pendingUpdate !== null) break;

        // ── Fetch ──────────────────────────────────────────────────────────

        const weather = await fetchWeather({
          latitude: activity.coordinates.lat,
          longitude: activity.coordinates.lng,
          sensitivity: sensitivityFromCategory(activity.category),
          place: activity.place ?? "unknown",
        });

        log.debug("Weather polled", {
          place: activity.place,
          critical: weather.critical,
          severity: weather.severity,
          type: weather.type,
        });

        // ── Alert (deduplicated) ───────────────────────────────────────────

        if (weather.critical) {
          const alertKey = `${activity.place}::${weather.type}::${weather.severity}`;

          if (alertKey !== lastAlertKey) {
            await sendWeatherAlert({
              email: "ravindrarinwa618@gmail.com",
              message: weather.message,
              subject: "Weather Alert",
            });
            lastAlertKey = alertKey;
            alertsSent++;

            log.warn("Alert sent", {
              place: activity.place,
              severity: weather.severity,
              alertsSent,
            });
          }
        } else {
          if (lastAlertKey !== "") {
            log.info("Weather normalised", { place: activity.place });
            lastAlertKey = "";
          }
        }

        // ── Sleep until next poll ──────────────────────────────────────────
        // Clamped to [MIN_SLEEP_MS, remainingMs] — never sleep(0) or sleep(-n)

        const remainingMs = endMs - Date.now();
        if (remainingMs <= 0) break;

        const intervalMs = weather.critical ? POLL_CRITICAL_MS : POLL_NORMAL_MS;
        const sleepMs = Math.max(
          MIN_SLEEP_MS,
          Math.min(intervalMs, remainingMs),
        );

        const woken = await condition(
          () => isCancelled || pendingUpdate !== null,
          sleepMs,
        );

        if (woken) break;
      }

      log.info("Activity monitoring done", {
        place: activity.place,
        day: day.day,
      });
    }

    currentDay++;
  }

  log.info("All activities processed – holding until end of last day", {
    tripId,
    alertsSent,
  });

  // ── Hold until midnight of the last day ─────────────────────────────────────
  // Signals (cancel / itinerary update) still wake us early.

  while (true) {
    if (isCancelled) {
      log.info("Cancelled during end-of-trip hold", { tripId });
      return;
    }

    // Re-compute on every iteration — itinerary may have been updated
    if (pendingUpdate !== null) {
      const update = pendingUpdate as PendingUpdate;
      itinerary = [...update.itinerary];
      appliedVersion = update.version;
      pendingUpdate = null;

      const resume = firstRelevantDay(itinerary, timezone);
      if (resume !== -1) {
        // New days were added — jump back into the main loop
        currentDay = resume;
        // Re-enter by restarting the workflow continuation
        await continueAsNew<typeof WeatherTrackingWorkflow>({
          tripId,
          itinerary,
          resumeDayIdx: currentDay,
          resumeActIdx: 0,
          alertsSent,
        });
        return;
      }

      // Update received but still no future activities — recalculate end time
      log.info("Itinerary updated during hold, no new future activities", {
        appliedVersion,
      });
    }

    const endMs = tripEndMidnightMs(itinerary, timezone);
    const remainingMs = endMs - Date.now();

    if (remainingMs <= 0) break; // midnight passed — done

    log.info("Waiting until end of last day", {
      tripId,
      endMs: new Date(endMs).toISOString(),
      remainingMs,
    });

    const woken = await condition(
      () => isCancelled || pendingUpdate !== null,
      Math.max(MIN_SLEEP_MS, remainingMs),
    );

    if (!woken) break; // timeout fired naturally — midnight reached
  }

  log.info("Workflow complete – all days monitored", { tripId, alertsSent });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Converts day.date (ISO string) + activity.startTime / endTime ("HH:mm")
 * + trip timezone (IANA e.g. "Asia/Kolkata") → UTC epoch milliseconds.
 *
 * Example:
 *   date = "2025-06-15", time = "09:30", tz = "Asia/Kolkata"
 *   → 2025-06-15T04:00:00.000Z  (09:30 IST = 04:00 UTC)
 */
function toEpochMs(
  dateStr: string | Date,
  timeStr: string | undefined,
  timezone: string,
): number | null {
  if (!timeStr) return null;

  const match = timeStr.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;

  const [, hh, mm] = match;

  // Get the YYYY-MM-DD in the trip's timezone (handles DST correctly)
  const datePart = new Date(dateStr).toLocaleDateString("en-CA", {
    timeZone: timezone,
  });

  // Probe a UTC instant and compare it to what the timezone formatter
  // says the local time is — difference gives us the UTC offset
  const probe = new Date(`${datePart}T${hh}:${mm}:00Z`);

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(probe).map(({ type, value }) => [type, value]),
  );

  const utcProbe = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );

  const offsetMs = probe.getTime() - utcProbe;

  const localEpochMs = Date.UTC(
    Number(datePart.slice(0, 4)),
    Number(datePart.slice(5, 7)) - 1,
    Number(datePart.slice(8, 10)),
    Number(hh),
    Number(mm),
    0,
  );

  return localEpochMs + offsetMs;
}

/** Index of first day that has at least one un-elapsed activity. -1 if none. */
function firstRelevantDay(
  itinerary: IItineraryDay[],
  timezone: string,
): number {
  return itinerary.findIndex((day) =>
    day.activities.some((a) => {
      const endMs = toEpochMs(day.date, a.endTime, timezone);
      return endMs !== null && endMs > Date.now();
    }),
  );
}

/** True when every activity on a day has already ended. */
function isDayFullyElapsed(day: IItineraryDay, timezone: string): boolean {
  if (!day.activities.length) return true;
  return day.activities.every((a) => {
    const endMs = toEpochMs(day.date, a.endTime, timezone);
    return endMs === null || endMs <= Date.now();
  });
}

/**
 * Maps activity category → weather sensitivity.
 * Outdoor activities get higher sensitivity so minor weather triggers alerts.
 */
function sensitivityFromCategory(
  category: ActivityCategory | undefined,
): "low" | "medium" | "high" {
  switch (category) {
    case "sightseeing":
      return "high"; // fully exposed
    case "leisure":
      return "high"; // parks, beaches, hikes
    case "transport":
      return "medium"; // delays possible
    case "food":
      return "low"; // mostly indoors
    default:
      return "medium";
  }
}

/** Returns epoch ms for midnight (00:00) at the START of the day AFTER the last itinerary day,
 *  i.e. "end of last day" in the trip's timezone. */
function tripEndMidnightMs(
  itinerary: IItineraryDay[],
  timezone: string,
): number {
  const lastDay = itinerary[itinerary.length - 1];
  if (!lastDay) return Date.now();

  // midnight = 00:00 the NEXT calendar day in the trip's timezone = end of last day
  const datePart = new Date(lastDay.date).toLocaleDateString("en-CA", {
    timeZone: timezone,
  });

  // Advance by one day to get "00:00 next day" = "24:00 last day"
  const [y, m, d] = datePart.split("-").map(Number);
  const nextDay = new Date(Date.UTC(y, m - 1, d + 1)); // UTC midnight next day

  // Convert "00:00 next day" in trip timezone → UTC epoch
  const midnightMs = toEpochMs(nextDay.toISOString(), "00:00", timezone);
  return midnightMs ?? nextDay.getTime();
}
