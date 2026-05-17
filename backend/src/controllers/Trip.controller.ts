import type { Request, Response } from "express";
import { Types } from "mongoose";
import { Trip } from "../models/trip.schema.js";
import {
  CreateTripSchema,
  UpdateTripSchema,
  UpdateItinerarySchema,
} from "../validators/trip.validator.js";
import type { AuthRequest } from "../types/express.js";
import { getTripByIdService } from "../services/getTripByIdService.js";
import { getTemporalClient } from "../temporal-workflow/client.js";
import { WeatherTrackingWorkflow } from "../temporal-workflow/weather-tracking-workflow/workflow.js";
import { WorkflowInput } from "../temporal-workflow/weather-tracking-workflow/workflow.js";

/* ─────────────────────────────────────────
   Helpers
───────────────────────────────────────── */

/** Send a consistently-shaped error response. */
const sendError = (res: Response, status: number, message: string) =>
  res.status(status).json({ status: status < 500 ? "fail" : "error", message });

/** Return true if `id` is a valid 24-char Mongo ObjectId. */
const isValidObjectId = (id: string) => Types.ObjectId.isValid(id);

function mapTraveler(t: { name: string; userId?: string }) {
  return {
    name: t.name,
    userId: t.userId ? new Types.ObjectId(t.userId) : undefined,
  };
}

function mapActivity(activity: any) {
  return {
    description: activity.description,
    place: activity.place,
    category: activity.category,
    status: activity.status ?? "planned",
    startTime: activity.startTime,
    endTime: activity.endTime,
    cost: activity.cost,
    bookingReference: activity.bookingReference,
    notes: activity.notes,
    coordinates: activity.coordinates
      ? { lat: activity.coordinates.lat, lng: activity.coordinates.lng }
      : undefined,
  };
}

function mapDay(day: any) {
  return {
    day: day.day,
    date: day.date,
    title: day.title,
    accommodation: day.accommodation,
    estimatedCost: day.estimatedCost,
    activities: day.activities?.map(mapActivity) ?? [],
  };
}

/* ─────────────────────────────────────────
   Create Trip
───────────────────────────────────────── */

export const createTrip = async (req: AuthRequest, res: Response) => {
  // Attach userId before validation so the schema can check it
  req.body.userId = req?.user?._id?.toString();

  if (!req.body.userId) {
    return sendError(res, 401, "You must be logged in to create a trip");
  }

  const parsed = CreateTripSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      status: "fail",
      message: "Invalid trip data. Please check the fields and try again.",
      errors: parsed.error.flatten(),
    });
  }

  try {
    const d = parsed.data;

    const newTrip = new Trip({
      userId: d.userId,
      title: d.title,
      destination: d.destination,
      startDate: d.startDate,
      endDate: d.endDate,
      timezone: d.timezone ?? "UTC",
      status: d.status ?? "planning",
      visibility: d.visibility ?? "private",
      budget: d.budget,
      totalSpent: d.totalSpent ?? 0,
      currency: d.currency ?? "USD",
      travelers: d.travelers?.map(mapTraveler) ?? [],
      tags: d.tags ?? [],
      itinerary: d.itinerary?.map(mapDay) ?? [],
    });

    await newTrip.save();

    return res.status(201).json({ status: "success", trip: newTrip });
  } catch (error: any) {
    console.error("[createTrip]", error);
    return sendError(res, 500, "Something went wrong while creating the trip");
  }
};

/* ─────────────────────────────────────────
   Update Trip
───────────────────────────────────────── */

export const updateTripById = async (req: Request, res: Response) => {
  const tripId = req.params.tripId as string;

  if (!isValidObjectId(tripId)) {
    return sendError(res, 400, "The provided trip ID is not valid");
  }

  const parsed = UpdateTripSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      status: "fail",
      message: "Invalid update data. Please check the fields and try again.",
      errors: parsed.error.flatten(),
    });
  }

  try {
    const trip = await Trip.findById(tripId);
    if (!trip) {
      return sendError(res, 404, "Trip not found. It may have been deleted.");
    }

    const d = parsed.data;

    if (d.title !== undefined) trip.title = d.title;
    if (d.destination !== undefined) trip.destination = d.destination;
    if (d.timezone !== undefined) trip.timezone = d.timezone;
    if (d.status !== undefined) trip.status = d.status;
    if (d.visibility !== undefined) trip.visibility = d.visibility;
    if (d.budget !== undefined) trip.budget = d.budget;
    if (d.totalSpent !== undefined) trip.totalSpent = d.totalSpent;
    if (d.currency !== undefined) trip.currency = d.currency;
    if (d.startDate !== undefined) trip.startDate = d.startDate;
    if (d.endDate !== undefined) trip.endDate = d.endDate;
    if (d.travelers !== undefined)
      trip.travelers = d.travelers.map(mapTraveler);
    if (d.tags !== undefined) trip.tags = d.tags;

    await trip.save();

    return res.status(200).json({ status: "success", trip });
  } catch (error: any) {
    console.error("[updateTripById]", error);
    return sendError(res, 500, "Something went wrong while updating the trip");
  }
};

/* ─────────────────────────────────────────
   Update Itinerary
───────────────────────────────────────── */

export const updateTripItinerary = async (req: Request, res: Response) => {
  const tripId = req.params.tripId as string;

  if (!isValidObjectId(tripId)) {
    return sendError(res, 400, "The provided trip ID is not valid");
  }

  const parsed = UpdateItinerarySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      status: "fail",
      message: "Invalid itinerary data. Please check the fields and try again.",
      errors: parsed.error.flatten(),
    });
  }

  const { itinerary: itineraryUpdates } = parsed.data;

  try {
    const trip = await Trip.findById(tripId);
    if (!trip) {
      return sendError(res, 404, "Trip not found. It may have been deleted.");
    }

    for (const update of itineraryUpdates) {
      const day = trip.itinerary.find((d) => d.day === update.day);

      if (!day) {
        trip.itinerary.push({
          day: update.day,
          date: update.date ?? new Date(),
          title: update.title,
          accommodation: update.accommodation,
          estimatedCost: update.estimatedCost,
          activities: update.activities?.map(mapActivity) ?? [],
        } as any);
      } else {
        if (update.date !== undefined) day.date = update.date;
        if (update.title !== undefined) day.title = update.title;
        if (update.accommodation !== undefined)
          day.accommodation = update.accommodation;
        if (update.estimatedCost !== undefined)
          day.estimatedCost = update.estimatedCost;
        if (update.activities !== undefined)
          day.activities = update.activities.map(mapActivity);
      }

      trip.itinerary.sort((a, b) => a.day - b.day);
      await trip.save();

      // Signal Temporal workflow only when updating an existing day
      if (day) {
        try {
          const client = await getTemporalClient();
          const workflowId = "weather-" + trip._id.toString().trim();

          let handle;
          try {
            handle = client.workflow.getHandle(workflowId);
            await handle.describe();
          } catch {
            handle = await client.workflow.start(WeatherTrackingWorkflow, {
              taskQueue: "weather-monitoring",
              workflowId,
              args: [{ tripId: trip._id.toString() } satisfies WorkflowInput],
            });
          }

          await handle.signal("updateItinerary", trip.itinerary);
        } catch (temporalErr) {
          // Log but don't fail the request — itinerary is already saved
          console.error(
            "[updateTripItinerary] Temporal signal failed (non-fatal):",
            temporalErr,
          );
        }
      }
    }

    return res.status(200).json({ status: "success", trip });
  } catch (error: any) {
    console.error("[updateTripItinerary]", error);
    return sendError(
      res,
      500,
      "Something went wrong while updating the itinerary",
    );
  }
};

/* ─────────────────────────────────────────
   Get Single Trip
───────────────────────────────────────── */

export const getTripById = async (req: Request, res: Response) => {
  const tripId = req.params.tripId as string;

  if (!tripId || !isValidObjectId(tripId)) {
    return sendError(res, 400, "The provided trip ID is not valid");
  }

  try {
    const trip = await getTripByIdService(tripId);
    if (!trip) {
      return sendError(res, 404, "Trip not found. It may have been deleted.");
    }

    return res.status(200).json({ status: "success", trip });
  } catch (error: any) {
    console.error("[getTripById]", error);
    return sendError(res, 500, "Something went wrong while fetching the trip");
  }
};

/* ─────────────────────────────────────────
   Get All Trips for Authenticated User
───────────────────────────────────────── */

export const getAllTripsOfUser = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return sendError(res, 401, "You must be logged in to view your trips");
    }

    const trips = await Trip.find({ userId }).sort({ createdAt: -1 });

    return res.status(200).json({
      status: "success",
      results: trips.length,
      data: trips,
    });
  } catch (error: any) {
    console.error("[getAllTripsOfUser]", error);
    return sendError(
      res,
      500,
      "Something went wrong while fetching your trips",
    );
  }
};

/* ─────────────────────────────────────────
   Delete Trip
───────────────────────────────────────── */

export const deleteTripById = async (req: AuthRequest, res: Response) => {
  const tripId = req.params.tripId as string;

  if (!isValidObjectId(tripId)) {
    return sendError(res, 400, "The provided trip ID is not valid");
  }

  try {
    const trip = await Trip.findOneAndDelete({
      _id: tripId,
      userId: req.user?._id,
    });

    if (!trip) {
      return sendError(
        res,
        404,
        "Trip not found, or you do not have permission to delete it",
      );
    }

    // Attempt to cancel the Temporal workflow, but don't fail the response if it's missing
    try {
      const client = await getTemporalClient();
      const workflowId = "weather-" + trip._id.toString().trim();
      const handle = client.workflow.getHandle(workflowId);
      await handle.signal("cancelTrip");
    } catch (temporalErr) {
      console.error(
        "[deleteTripById] Temporal cancel signal failed (non-fatal):",
        temporalErr,
      );
    }

    return res.status(204).send();
  } catch (error: any) {
    console.error("[deleteTripById]", error);
    return sendError(res, 500, "Something went wrong while deleting the trip");
  }
};
