import { Schema, model, Types } from "mongoose";

/* ---------- Types ---------- */

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
  userId?: Types.ObjectId;
}

export interface IItineraryActivity {
  description?: string;
  place?: string;
  coordinates?: ICoordinates;
  category?: ActivityCategory;
  status: ActivityStatus;
  startTime?: string; // "HH:mm" e.g. "09:30"
  endTime?: string; // "HH:mm" e.g. "11:00"
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
  userId: Types.ObjectId;
  title: string;
  destination: string;
  startDate: Date;
  endDate: Date;
  timezone: string;
  status: TripStatus;
  visibility: TripVisibility;
  budget: number;
  currency: string;
  totalSpent: number;
  coverImage?: string;
  travelers: ITraveler[];
  tags: string[];
  itinerary: IItineraryDay[];
  createdAt: Date;
  updatedAt: Date;
}

/* ---------- Sub Schemas ---------- */

const CoordinatesSchema = new Schema<ICoordinates>(
  {
    lat: { type: Number, required: true, min: -90, max: 90 },
    lng: { type: Number, required: true, min: -180, max: 180 },
  },
  { _id: false },
);

const TravelerSchema = new Schema<ITraveler>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    userId: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { _id: false },
);

const ItineraryActivitySchema = new Schema<IItineraryActivity>(
  {
    description: { type: String, trim: true, maxlength: 500 },
    place: { type: String, trim: true, maxlength: 150 },
    coordinates: { type: CoordinatesSchema },

    category: {
      type: String,
      enum: [
        "food",
        "transport",
        "sightseeing",
        "accommodation",
        "leisure",
        "shopping",
        "other",
      ],
    },

    status: {
      type: String,
      enum: ["planned", "confirmed", "cancelled"],
      default: "planned",
    },

    // "HH:mm" 24-hour format — stored as string to avoid timezone distortion
    startTime: {
      type: String,
      match: [/^\d{2}:\d{2}$/, "startTime must be in HH:mm format"],
    },
    endTime: {
      type: String,
      match: [/^\d{2}:\d{2}$/, "endTime must be in HH:mm format"],
    },

    cost: { type: Number, min: 0 },
    bookingReference: { type: String, trim: true, maxlength: 100 },
    notes: { type: String, trim: true, maxlength: 1000 },
  },
  { _id: false },
);

const ItineraryDaySchema = new Schema<IItineraryDay>(
  {
    day: { type: Number, required: true, min: 1 },
    date: { type: Date, required: true },

    title: { type: String, trim: true, maxlength: 150 },

    accommodation: { type: String, trim: true, maxlength: 200 },

    // sum of activity costs for that day — can be computed or manually set
    estimatedCost: { type: Number, min: 0 },

    activities: { type: [ItineraryActivitySchema], default: [] },
  },
  { _id: false },
);

/* ---------- Main Schema ---------- */

const TripSchema = new Schema<ITrip>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },

    destination: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },

    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },

    timezone: {
      type: String,
      required: true,
      trim: true,
      default: "UTC",
    },

    status: {
      type: String,
      enum: ["planning", "upcoming", "ongoing", "completed"],
      default: "planning",
    },

    visibility: {
      type: String,
      enum: ["private", "shared", "public"],
      default: "private",
    },

    budget: { type: Number, required: true, min: 0 },
    totalSpent: { type: Number, default: 0, min: 0 },

    // ISO 4217 currency code e.g. "USD", "JPY", "EUR"
    currency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      match: [/^[A-Z]{3}$/, "currency must be a valid ISO 4217 code"],
      default: "USD",
    },

    coverImage: { type: String, trim: true },

    travelers: { type: [TravelerSchema], default: [] },

    tags: {
      type: [String],
      default: [],
      validate: {
        validator: (v: string[]) => v.length <= 20,
        message: "Cannot have more than 20 tags",
      },
    },

    itinerary: { type: [ItineraryDaySchema], default: [] },
  },
  { timestamps: true },
);

/* ---------- Indexes ---------- */

TripSchema.index({ userId: 1, createdAt: -1 });
TripSchema.index({ userId: 1, status: 1 });
TripSchema.index({ visibility: 1 });
TripSchema.index({ tags: 1 });

/* ---------- Hooks ---------- */

TripSchema.pre("save", function () {
  // 1. Date range
  if (this.endDate < this.startDate) {
    throw new Error("endDate must be >= startDate");
  }

  const expectedDays =
    Math.ceil(
      (this.endDate.getTime() - this.startDate.getTime()) /
        (1000 * 60 * 60 * 24),
    ) + 1;

  if (this.itinerary.length) {
    // 2. Itinerary length
    if (this.itinerary.length > expectedDays) {
      throw new Error("Itinerary days cannot exceed trip duration");
    }

    for (let i = 0; i < this.itinerary.length; i++) {
      const d = this.itinerary[i];

      // 3. Day numbering
      if (d.day !== i + 1) {
        throw new Error("Invalid itinerary day numbering");
      }

      // 4. Each day's `date` must match startDate + offset
      const expectedDate = new Date(this.startDate);
      expectedDate.setDate(expectedDate.getDate() + i);
      const diff = Math.abs(d.date.getTime() - expectedDate.getTime());
      if (diff > 1000 * 60 * 60 * 24) {
        throw new Error(
          `Day ${d.day} date does not match trip startDate offset`,
        );
      }

      // 5. Activity time ordering
      for (const act of d.activities) {
        if (act.startTime && act.endTime && act.endTime < act.startTime) {
          throw new Error(
            `Day ${d.day}: activity endTime cannot be before startTime`,
          );
        }
      }
    }
  }

  // 6. totalSpent should not exceed budget (warn via error — remove if you want soft validation only)
  if (this.totalSpent > this.budget) {
    throw new Error("totalSpent cannot exceed budget");
  }
});

/* ---------- Model ---------- */

export const Trip = model<ITrip>("Trip", TripSchema);
