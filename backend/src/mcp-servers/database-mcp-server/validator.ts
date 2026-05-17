import { z } from "zod";

export const ItineraryActivityInputSchema = z.object({
  description: z.string().optional().describe("Activity description"),
  place: z.string().optional().describe("Place of activity"),
});

export const ItineraryDayUpdateSchema = z.object({
  day: z.number().int().min(1).describe("Day number to update"),
  title: z.string().optional().describe("Title for the day"),
  activities: z
    .array(ItineraryActivityInputSchema)
    .optional()
    .describe("Activities for the day"),
});
