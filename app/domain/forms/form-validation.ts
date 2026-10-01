import { z } from "zod";

export const formFieldTypes = ["short_text", "long_text", "number", "date", "single_select", "multi_select", "checkbox"] as const;
export type FormFieldType = typeof formFieldTypes[number];

export const formFieldSchema = z.object({
  key: z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9_]{1,39}$/),
  label: z.string().trim().min(2).max(120),
  helpText: z.string().trim().max(300).optional().default(""),
  type: z.enum(formFieldTypes),
  required: z.boolean().default(false),
  sensitive: z.boolean().default(false),
  options: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
});

export type PublishedField = z.infer<typeof formFieldSchema> & { id: string; sortOrder: number };

export function validateFieldAnswer(field: PublishedField, values: FormDataEntryValue[]) {
  const strings = values.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean);
  if (field.required && strings.length === 0) return "This field is required.";
  if (strings.length === 0) return null;
  if (field.type === "checkbox" && !strings.includes("yes")) return field.required ? "This acknowledgement is required." : null;
  if (field.type === "number" && strings.some((value) => !Number.isFinite(Number(value)))) return "Enter a valid number.";
  if (field.type === "date" && strings.some((value) => !z.iso.date().safeParse(value).success)) return "Enter a valid date.";
  if ((field.type === "single_select" || field.type === "multi_select") && strings.some((value) => !field.options.includes(value))) return "Choose a listed option.";
  if (field.type !== "multi_select" && strings.length > 1) return "Choose one value.";
  return null;
}
