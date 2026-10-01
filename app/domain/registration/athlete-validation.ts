import { z } from "zod";

export const athleteDetailsSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  dateOfBirth: z.iso.date().refine((value) => new Date(`${value}T00:00:00Z`) < new Date(), "Date of birth must be in the past"),
  phone: z.string().trim().min(7).max(30),
  nationality: z.string().trim().min(2).max(80),
  clubName: z.string().trim().max(120).optional().default(""),
  emergencyContactName: z.string().trim().min(2).max(120),
  emergencyContactPhone: z.string().trim().min(7).max(30),
  medicalNotes: z.string().trim().max(2000).optional().default(""),
});

export function ageOnDate(dateOfBirth: string, onDate: string) {
  const birth = new Date(`${dateOfBirth}T00:00:00Z`);
  const target = new Date(onDate);
  let age = target.getUTCFullYear() - birth.getUTCFullYear();
  const monthDifference = target.getUTCMonth() - birth.getUTCMonth();
  if (monthDifference < 0 || (monthDifference === 0 && target.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age;
}

export function isMinorOnEventDate(dateOfBirth: string, eventStartsAt: string) {
  return ageOnDate(dateOfBirth, eventStartsAt) < 18;
}
