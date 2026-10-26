import { z } from "zod";
import { IsoDateSchema, WeekdaySchema } from "./common";

export const TimeWindowSchema = z.object({
  start: z.string().regex(/^\d{2}:\d{2}$/, "Expected HH:mm"),
  end: z.string().regex(/^\d{2}:\d{2}$/, "Expected HH:mm"),
});

export const DayAvailabilitySchema = z.object({
  day: WeekdaySchema,
  windows: z.array(TimeWindowSchema).default([]),
  maxDurationMin: z.number().int().min(10).max(300).default(60),
});

export const AvailabilitySchema = z.object({
  days: z.array(DayAvailabilitySchema).min(1),
  blackouts: z.array(IsoDateSchema).default([]),
});

export type DayAvailability = z.infer<typeof DayAvailabilitySchema>;
export type Availability = z.infer<typeof AvailabilitySchema>;
