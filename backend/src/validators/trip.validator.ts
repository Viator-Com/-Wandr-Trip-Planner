import { z } from "zod";

/* ─────────────────────────────────────────
   Shared enums
───────────────────────────────────────── */

const ActivityCategoryEnum = z.enum([
  "food",
  "transport",
  "sightseeing",
  "accommodation",
  "leisure",
  "shopping",
  "other",
]);

const ActivityStatusEnum = z.enum(["planned", "confirmed", "cancelled"]);

const TripStatusEnum = z.enum(["planning", "upcoming", "ongoing", "completed"]);

const TripVisibilityEnum = z.enum(["private", "shared", "public"]);

/* ─────────────────────────────────────────
   Sub-schemas
───────────────────────────────────────── */

const CoordinatesSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const TravelerSchema = z.object({
  name: z.string().min(1).max(100),
  userId: z.string().optional(),
});

/* HH:mm 24-hour format */
const TimeString = z
  .string()
  .regex(/^\d{2}:\d{2}$/, "Time must be in HH:mm format")
  .optional();

export const ItineraryActivitySchema = z.object({
  description: z.string().max(500).optional(),
  place: z.string().max(150).optional(),
  coordinates: CoordinatesSchema,
  category: ActivityCategoryEnum.optional(),
  status: ActivityStatusEnum.default("planned"),
  startTime: TimeString,
  endTime: TimeString,
  cost: z.number().min(0).optional(),
  bookingReference: z.string().max(100).optional(),
  notes: z.string().max(1000).optional(),
});

export const ItineraryDaySchema = z.object({
  day: z.number().int().min(1),
  date: z.coerce.date(),
  title: z.string().max(150).optional(),
  accommodation: z.string().max(200).optional(),
  estimatedCost: z.number().min(0).optional(),
  activities: z.array(ItineraryActivitySchema).default([]),
});

/* ─────────────────────────────────────────
   Create Trip
───────────────────────────────────────── */

export const CreateTripSchema = z
  .object({
    userId: z.string(),
    title: z.string().min(2).max(100),
    destination: z.string().min(2).max(100),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    timezone: z.string().default("UTC"),
    status: TripStatusEnum.default("planning"),
    visibility: TripVisibilityEnum.default("private"),
    budget: z.number().min(0),
    totalSpent: z.number().min(0).default(0),
    currency: z
      .string()
      .length(3)
      .regex(/^[A-Z]{3}$/, "Must be a valid ISO 4217 currency code")
      .default("USD"),
    travelers: z
      .preprocess(
        (val) =>
          Array.isArray(val)
            ? val.map((t) => (typeof t === "string" ? { name: t } : t))
            : val,
        z.array(TravelerSchema),
      )
      .default([]),
    tags: z.array(z.string()).max(20).default([]),
    itinerary: z.array(ItineraryDaySchema).default([]),
  })
  .refine((d) => d.endDate >= d.startDate, {
    message: "endDate must be on or after startDate",
    path: ["endDate"],
  })
  .refine(
    (d) => {
      if (!d.itinerary.length) return true;
      const expectedDays =
        Math.ceil(
          (d.endDate.getTime() - d.startDate.getTime()) / (1000 * 60 * 60 * 24),
        ) + 1;
      return d.itinerary.length <= expectedDays;
    },
    {
      message: "Itinerary days cannot exceed trip duration",
      path: ["itinerary"],
    },
  )
  .refine((d) => d.itinerary.every((day, i) => day.day === i + 1), {
    message: "Itinerary days must be numbered sequentially starting from 1",
    path: ["itinerary"],
  });

/* ─────────────────────────────────────────
   Update Activity  (all fields optional)
───────────────────────────────────────── */

export const ItineraryActivityUpdateSchema = z.object({
  description: z.string().max(500).optional(),
  place: z.string().max(150).optional(),
  coordinates: CoordinatesSchema,
  category: ActivityCategoryEnum.optional(),
  status: ActivityStatusEnum.optional(), // optional — no default on update
  startTime: TimeString,
  endTime: TimeString,
  cost: z.number().min(0).optional(),
  bookingReference: z.string().max(100).optional(),
  notes: z.string().max(1000).optional(),
});

/* ─────────────────────────────────────────
   Update Day
   • `day` is required as the lookup key
   • everything else is optional
   • `activities` can be omitted entirely (day-only update),
     or supplied as a full replacement array
───────────────────────────────────────── */

export const ItineraryDayUpdateSchema = z.object({
  day: z.number().int().min(1), // lookup key — required
  date: z.coerce.date().optional(),
  title: z.string().max(150).optional(),
  accommodation: z.string().max(200).optional(),
  estimatedCost: z.number().min(0).optional(),
  activities: z.array(ItineraryActivityUpdateSchema).optional(),
});

/* ─────────────────────────────────────────
   Update Trip  (every field independent)
───────────────────────────────────────── */

export const UpdateTripSchema = z
  .object({
    title: z.string().min(2).max(100).optional(),
    destination: z.string().min(2).max(100).optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    timezone: z.string().optional(),
    status: TripStatusEnum.optional(),
    visibility: TripVisibilityEnum.optional(),
    budget: z.number().min(0).optional(),
    totalSpent: z.number().min(0).optional(),
    currency: z
      .string()
      .length(3)
      .regex(/^[A-Z]{3}$/, "Must be a valid ISO 4217 currency code")
      .optional(),
    travelers: z.array(TravelerSchema).optional(),
    tags: z.array(z.string()).max(20).optional(),
    itinerary: z.array(ItineraryDayUpdateSchema).optional(),
  })
  .refine(
    (d) => {
      if (d.startDate && d.endDate) return d.endDate >= d.startDate;
      return true;
    },
    {
      message: "endDate must be on or after startDate",
      path: ["endDate"],
    },
  );

/* ─────────────────────────────────────────
   Inferred types
───────────────────────────────────────── */

export type CreateTripInput = z.infer<typeof CreateTripSchema>;
export type UpdateTripInput = z.infer<typeof UpdateTripSchema>;
export type ItineraryDayInput = z.infer<typeof ItineraryDaySchema>;
export type ItineraryActivityInput = z.infer<typeof ItineraryActivitySchema>;
export type ItineraryDayUpdateInput = z.infer<typeof ItineraryDayUpdateSchema>;
export type ItineraryActivityUpdateInput = z.infer<
  typeof ItineraryActivityUpdateSchema
>;

/* ─────────────────────────────────────────
   Update Itinerary  (itinerary-only patch)
───────────────────────────────────────── */

export const UpdateItinerarySchema = z.object({
  itinerary: z
    .array(ItineraryDayUpdateSchema)
    .min(1, "At least one day is required"),
});

export type UpdateItineraryInput = z.infer<typeof UpdateItinerarySchema>;
