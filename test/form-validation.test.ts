import { describe, expect, it } from "vitest";
import { formFieldSchema, validateFieldAnswer } from "../app/domain/forms/form-validation";

describe("versioned form fields", () => {
  it("requires stable machine keys", () => expect(formFieldSchema.safeParse({ key: "Expected Time", label: "Expected time", type: "short_text" }).success).toBe(false));
  it("rejects select values outside the published options", () => expect(validateFieldAnswer({ id: "f1", key: "shirt", label: "Shirt", helpText: "", type: "single_select", required: true, sensitive: false, options: ["S", "M"], sortOrder: 0 }, ["XL"])).toBe("Choose a listed option."));
  it("accepts a required acknowledgement", () => expect(validateFieldAnswer({ id: "f2", key: "rules", label: "Rules", helpText: "", type: "checkbox", required: true, sensitive: false, options: [], sortOrder: 0 }, ["yes"])).toBeNull());
});
