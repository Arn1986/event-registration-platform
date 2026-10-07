import { useState, useRef, type ChangeEvent } from "react";
import { Form, Link, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/organizer-event-new";
import { hasPermission } from "../domain/auth/rbac";
import { eventInputSchema, slugify } from "../domain/events/event-validation";
import { requireOrganizer } from "../infrastructure/auth/organizer-session.server";
import { createEvent } from "../infrastructure/db/event-repository.server";

const EVENT_PRESET_IMAGES = [
  { label: "Road Marathon", url: "/images/presets/slide1_running_dawn.jpg" },
  { label: "Triathlon / Cycling", url: "/images/presets/slide2_triathlon_bike.jpg" },
  { label: "Open Water Swim", url: "/images/presets/slide3_open_water.jpg" },
  { label: "Track Sprint", url: "/images/presets/slide4_stadium_track.jpg" },
  { label: "Finish Line", url: "/images/presets/slide5_finish_line.jpg" },
];

export async function action({ request }: Route.ActionArgs) {
  const session = await requireOrganizer(request);
  if (!hasPermission(session.role, "events.create")) return data({ error: "Your role cannot create events." }, { status: 403 });
  const formData = await request.formData();
  const raw = Object.fromEntries(formData);
  if (!raw.slug) raw.slug = slugify(String(raw.name ?? ""));
  const result = eventInputSchema.safeParse(raw);
  if (!result.success) return data({ error: result.error.issues[0]?.message ?? "Check the event details." }, { status: 400 });
  try {
    const eventId = await createEvent(result.data, session.email);
    throw redirect(`/organizer/events/${eventId}?created=1`);
  } catch (error) {
    if (error instanceof Response) throw error;
    return data({ error: "The event could not be created. Check that its URL slug is unique." }, { status: 400 });
  }
}

export default function OrganizerEventNew({ actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";

  const [imageUrl, setImageUrl] = useState("/images/presets/slide1_running_dawn.jpg");
  const [imageMode, setImageMode] = useState<"preset" | "upload" | "url">("preset");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Please select a valid image file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      setImageUrl(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  return (
    <>
      <Link className="back-link" to="/organizer">← Events</Link>
      <div className="organizer-heading">
        <span className="eyebrow eyebrow-dark">New event</span>
        <h1>Create an event</h1>
        <p>Start with the event basics, custom banner image, and venue. Races, categories, and waves come next.</p>
      </div>

      <Form method="post" className="admin-form-card">
        <div className="field-grid">
          <label>
            Event name
            <input name="name" required placeholder="3F Community Triathlon 2027" />
          </label>
          <label>
            URL slug
            <input name="slug" placeholder="Generated from the name" />
          </label>
        </div>

        <label>
          Summary
          <textarea name="summary" rows={4} placeholder="Describe the event and who it is for." />
        </label>

        {/* Event Banner Image Selection */}
        <div style={{ marginTop: "1rem", marginBottom: "1.5rem" }}>
          <label style={{ display: "block", marginBottom: "6px", fontWeight: 700 }}>
            Event Banner Image
          </label>
          <p style={{ margin: "0 0 12px", color: "var(--muted)", fontSize: "0.85rem" }}>
            This image will be displayed on the event card in the homepage explore list and as a prominent hero banner when athletes open the event.
          </p>

          <input type="hidden" name="imageUrl" value={imageUrl} />

          <div style={{ display: "flex", gap: "8px", marginBottom: "14px" }}>
            <button
              type="button"
              onClick={() => setImageMode("preset")}
              className={`button ${imageMode === "preset" ? "button-primary" : "button-muted"}`}
              style={{ minHeight: "36px", padding: "0 14px", fontSize: "0.8rem" }}
            >
              Choose Preset
            </button>
            <button
              type="button"
              onClick={() => setImageMode("upload")}
              className={`button ${imageMode === "upload" ? "button-primary" : "button-muted"}`}
              style={{ minHeight: "36px", padding: "0 14px", fontSize: "0.8rem" }}
            >
              Upload Photo
            </button>
            <button
              type="button"
              onClick={() => setImageMode("url")}
              className={`button ${imageMode === "url" ? "button-primary" : "button-muted"}`}
              style={{ minHeight: "36px", padding: "0 14px", fontSize: "0.8rem" }}
            >
              Image URL
            </button>
            {imageUrl ? (
              <button
                type="button"
                onClick={() => setImageUrl("")}
                className="button button-muted"
                style={{ minHeight: "36px", padding: "0 12px", fontSize: "0.8rem", marginLeft: "auto" }}
              >
                Clear Image
              </button>
            ) : null}
          </div>

          {imageMode === "preset" ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: "10px", marginBottom: "14px" }}>
              {EVENT_PRESET_IMAGES.map((preset) => {
                const isSelected = imageUrl === preset.url;
                return (
                  <button
                    type="button"
                    key={preset.url}
                    onClick={() => setImageUrl(preset.url)}
                    style={{
                      border: isSelected ? "2px solid var(--purple)" : "1px solid var(--line)",
                      borderRadius: "10px",
                      overflow: "hidden",
                      padding: "4px",
                      background: isSelected ? "rgba(99,54,223,0.06)" : "var(--surface)",
                      cursor: "pointer",
                      textAlign: "center",
                    }}
                  >
                    <img src={preset.url} alt={preset.label} style={{ width: "100%", height: "65px", objectFit: "cover", borderRadius: "6px" }} />
                    <span style={{ fontSize: "0.75rem", fontWeight: 700, display: "block", marginTop: "4px" }}>{preset.label}</span>
                  </button>
                );
              })}
            </div>
          ) : null}

          {imageMode === "upload" ? (
            <div style={{ marginBottom: "14px" }}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleFileUpload}
                style={{ display: "block", width: "100%", padding: "10px", border: "1px dashed var(--line)", borderRadius: "8px" }}
              />
            </div>
          ) : null}

          {imageMode === "url" ? (
            <div style={{ marginBottom: "14px" }}>
              <input
                type="url"
                placeholder="https://..."
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid var(--line)" }}
              />
            </div>
          ) : null}

          {/* Banner Live Preview */}
          {imageUrl ? (
            <div style={{ position: "relative", height: "130px", borderRadius: "14px", overflow: "hidden", border: "1px solid var(--line)", display: "flex", alignItems: "flex-end", padding: "14px" }}>
              <img src={imageUrl} alt="Banner preview" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(16,19,26,0.2) 0%, rgba(16,19,26,0.85) 100%)" }} />
              <div style={{ position: "relative", zIndex: 1, color: "#fff" }}>
                <span className="eyebrow" style={{ color: "var(--lime)", fontSize: "0.68rem" }}>Banner preview</span>
                <strong style={{ display: "block", fontSize: "0.95rem" }}>Live event display on explore list & detail page</strong>
              </div>
            </div>
          ) : (
            <div style={{ padding: "16px", borderRadius: "10px", background: "var(--paper)", border: "1px dashed var(--line)", color: "var(--muted)", fontSize: "0.85rem", textAlign: "center" }}>
              No image selected. The event will show standard date typography on the homepage.
            </div>
          )}
        </div>

        <div className="field-grid">
          <label>
            Start date and time
            <input name="startsAt" type="datetime-local" required />
          </label>
          <label>
            Venue
            <input name="venueName" required placeholder="Dubai, United Arab Emirates" />
          </label>
        </div>

        <div className="field-grid">
          <label>
            Visibility
            <select name="visibility" defaultValue="public">
              <option value="public">Public</option>
              <option value="private">Private link</option>
            </select>
          </label>
          <label>
            Overall capacity
            <input name="capacity" type="number" min="1" placeholder="Unlimited" />
          </label>
        </div>

        {actionData?.error ? <p className="form-message form-error">{actionData.error}</p> : null}

        <div className="admin-form-actions">
          <Link className="button button-muted" to="/organizer">Cancel</Link>
          <button className="button button-primary" type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Create draft"}
          </button>
        </div>
      </Form>
    </>
  );
}
