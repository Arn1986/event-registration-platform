import { z } from "zod";

const optionalCapacity = z.preprocess(
  (value) => value === "" || value === null ? undefined : Number(value),
  z.number().int().min(1).max(1_000_000).optional(),
);

export const eventInputSchema = z.object({
  name: z.string().trim().min(3).max(120),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100),
  summary: z.string().trim().max(1000),
  startsAt: z.string().min(10),
  venueName: z.string().trim().min(2).max(160),
  visibility: z.enum(["public", "private"]),
  capacity: optionalCapacity,
});

export const raceInputSchema = z.object({
  name: z.string().trim().min(2).max(100),
  discipline: z.enum(["run", "swim", "bike", "triathlon", "duathlon", "other"]),
  distanceValue: z.coerce.number().int().positive().max(1_000_000),
  distanceUnit: z.enum(["m", "km"]),
  startsAt: z.string().min(10),
  capacity: optionalCapacity,
});

export const categoryInputSchema = z.object({
  raceId: z.string().min(1),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300),
  capacity: optionalCapacity,
});

export const waveInputSchema = z.object({
  raceId: z.string().min(1),
  name: z.string().trim().min(2).max(80),
  startsAt: z.string().min(10),
  capacity: optionalCapacity,
});

export function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100);
}
