import { useState, useRef, type ChangeEvent } from "react";
import { Form, Link, data, useNavigation } from "react-router";
import type { Route } from "./+types/organizer-hero";
import { hasPermission } from "../domain/auth/rbac";
import { heroSlideInputSchema } from "../domain/events/event-validation";
import { requireOrganizer } from "../infrastructure/auth/organizer-session.server";
import {
  createHeroSlide,
  deleteHeroSlide,
  listAllHeroSlides,
  reorderHeroSlides,
  resetDefaultHeroSlides,
  updateHeroSlide,
} from "../infrastructure/db/event-repository.server";

const PRESET_GALLERY = [
  {
    url: "/images/hero/slide1_running_dawn.jpg",
    title: "Dawn Striders",
    caption: "Community road & marathon training across the UAE",
    label: "Sunrise Road Run",
  },
  {
    url: "/images/hero/slide2_triathlon_bike.jpg",
    title: "Speed on the Open Road",
    caption: "Time-trial and cycling packs conquering distance",
    label: "Triathlon Cycling",
  },
  {
    url: "/images/hero/slide3_open_water.jpg",
    title: "Open Water Excellence",
    caption: "Triathlon swim legs in sparkling Arabian Gulf waters",
    label: "Open Water Swim",
  },
  {
    url: "/images/hero/slide4_stadium_track.jpg",
    title: "Track Speed & Intervals",
    caption: "Precision interval training under evening floodlights",
    label: "Stadium Track Sprint",
  },
  {
    url: "/images/hero/slide5_finish_line.jpg",
    title: "Celebrate Every Finish",
    caption: "Every athlete and distance celebrated as one team",
    label: "Finish Line Celebration",
  },
];

export function meta({}: Route.MetaArgs) {
  return [{ title: "Hero Carousel Images | 3F Striders Organizer" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const session = await requireOrganizer(request);
  const slides = await listAllHeroSlides();
  return {
    slides,
    canEdit: hasPermission(session.role, "events.edit"),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const session = await requireOrganizer(request);
  if (!hasPermission(session.role, "events.edit")) {
    return data({ ok: false as const, message: "Your role cannot modify carousel slides." }, { status: 403 });
  }

  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  try {
    if (intent === "add-slide") {
      const imageUrl = String(formData.get("imageUrl") ?? "");
      const title = String(formData.get("title") ?? "");
      const caption = String(formData.get("caption") ?? "");
      const validation = heroSlideInputSchema.safeParse({ imageUrl, title, caption, isActive: true });
      if (!validation.success) {
        return data({ ok: false as const, message: validation.error.issues[0]?.message ?? "Invalid image details." }, { status: 400 });
      }
      await createHeroSlide(
        {
          imageUrl: validation.data.imageUrl,
          title: validation.data.title,
          caption: validation.data.caption,
          isActive: true,
        },
        session.email
      );
      return { ok: true as const, message: "Carousel image imported successfully." };
    }

    if (intent === "toggle-active") {
      const slideId = String(formData.get("slideId") ?? "");
      const currentActive = formData.get("isActive") === "1" || formData.get("isActive") === "true";
      await updateHeroSlide(slideId, { isActive: !currentActive }, session.email);
      return { ok: true as const, message: `Image is now ${!currentActive ? "active in carousel" : "hidden"}.` };
    }

    if (intent === "delete-slide") {
      const slideId = String(formData.get("slideId") ?? "");
      await deleteHeroSlide(slideId, session.email);
      return { ok: true as const, message: "Image removed from carousel." };
    }

    if (intent === "move-slide") {
      const slideId = String(formData.get("slideId") ?? "");
      const direction = String(formData.get("direction") ?? "");
      const currentSlides = await listAllHeroSlides();
      const currentIndex = currentSlides.findIndex((s) => s.id === slideId);
      if (currentIndex === -1) return data({ ok: false as const, message: "Slide not found." }, { status: 400 });

      const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex >= 0 && targetIndex < currentSlides.length) {
        const reordered = [...currentSlides];
        const [moved] = reordered.splice(currentIndex, 1);
        reordered.splice(targetIndex, 0, moved);
        await reorderHeroSlides(reordered.map((s) => s.id), session.email);
        return { ok: true as const, message: "Image carousel order updated." };
      }
      return { ok: true as const, message: "No change in position." };
    }

    if (intent === "reset-defaults") {
      await resetDefaultHeroSlides(session.email);
      return { ok: true as const, message: "Reset to default 5 athletic carousel images." };
    }

    return data({ ok: false as const, message: "Unknown action." }, { status: 400 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to update carousel.";
    return data({ ok: false as const, message: msg }, { status: 400 });
  }
}

export default function OrganizerHero({ loaderData, actionData }: Route.ComponentProps) {
  const { slides, canEdit } = loaderData;
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";

  const [importMode, setImportMode] = useState<"preset" | "upload" | "url">("preset");
  const [selectedPresetUrl, setSelectedPresetUrl] = useState(PRESET_GALLERY[0].url);
  const [customImageUrl, setCustomImageUrl] = useState("");
  const [uploadedImageUrl, setUploadedImageUrl] = useState("");
  const [title, setTitle] = useState(PRESET_GALLERY[0].title);
  const [caption, setCaption] = useState(PRESET_GALLERY[0].caption);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const effectiveImageUrl =
    importMode === "preset"
      ? selectedPresetUrl
      : importMode === "upload"
      ? uploadedImageUrl
      : customImageUrl;

  const handlePresetSelect = (preset: typeof PRESET_GALLERY[number]) => {
    setSelectedPresetUrl(preset.url);
    setTitle(preset.title);
    setCaption(preset.caption);
    setUploadError(null);
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setUploadError("Please select a valid image file (JPEG, PNG, WebP).");
      return;
    }

    setUploadError(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setUploadedImageUrl(result);
      if (!title) {
        setTitle(file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "));
      }
    };
    reader.readAsDataURL(file);
  };

  const isFull = slides.length >= 5;

  return (
    <>
      <div className="section-heading organizer-heading">
        <div>
          <span className="eyebrow eyebrow-dark">Hero Experience</span>
          <h1>Hero page carousel</h1>
          <p>
            Manage the background images displayed on the homepage hero carousel. Maximum 5 images
            with matching gradient overlay for high contrast and brand vibrancy.
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <Link className="button button-muted" to="/" target="_blank" rel="noopener noreferrer">
            View live hero ↗
          </Link>
          <Form method="post">
            <input type="hidden" name="intent" value="reset-defaults" />
            <button
              className="button button-muted"
              type="submit"
              disabled={submitting || !canEdit}
              title="Reset to 5 default 3F Striders athletic images"
            >
              Restore 5 default slides
            </button>
          </Form>
        </div>
      </div>

      {actionData ? (
        <div className={actionData.ok ? "form-message form-success" : "form-message form-error"}>
          <span>{actionData.message}</span>
        </div>
      ) : null}

      <div className="admin-grid" style={{ marginBottom: "2rem" }}>
        <article className="metric-card">
          <span>Active slides</span>
          <strong>{slides.filter((s) => s.isActive).length} / 5</strong>
        </article>
        <article className="metric-card">
          <span>Total imported</span>
          <strong>{slides.length} / 5 max</strong>
        </article>
        <article className="metric-card">
          <span>Status</span>
          <strong style={{ fontSize: "1.3rem" }}>{isFull ? "Capacity reached" : "Slots available"}</strong>
        </article>
      </div>

      {/* Current carousel slides list */}
      <section className="table-card" style={{ marginBottom: "2.5rem" }}>
        <div className="table-title">
          <h2>Active carousel slides ({slides.length}/5)</h2>
          <span>Ordered 1 to {slides.length}</span>
        </div>

        {slides.length === 0 ? (
          <div className="empty-state">
            <h3>No carousel images configured</h3>
            <p>Import images below or click "Restore 5 default slides" to populate the hero carousel.</p>
          </div>
        ) : (
          <div style={{ display: "grid", gap: "16px", padding: "16px 0" }}>
            {slides.map((slide, index) => (
              <div
                key={slide.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "140px 1fr auto",
                  gap: "20px",
                  alignItems: "center",
                  padding: "16px",
                  borderRadius: "16px",
                  border: "1px solid var(--line)",
                  background: slide.isActive ? "var(--surface)" : "#f9f8f4",
                  opacity: slide.isActive ? 1 : 0.65,
                }}
              >
                {/* Thumbnail with overlay hint */}
                <div
                  style={{
                    position: "relative",
                    width: "140px",
                    height: "84px",
                    borderRadius: "10px",
                    overflow: "hidden",
                    border: "1px solid var(--line)",
                    background: "#1c1236",
                  }}
                >
                  <img
                    src={slide.imageUrl}
                    alt={slide.title || "Hero slide"}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                  {/* Miniature gradient overlay demo */}
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background:
                        "linear-gradient(135deg, rgba(75, 37, 188, 0.45) 0%, rgba(109, 59, 232, 0.35) 55%, rgba(46, 23, 111, 0.55) 100%)",
                      pointerEvents: "none",
                    }}
                  />
                  <span
                    style={{
                      position: "absolute",
                      bottom: "4px",
                      left: "6px",
                      background: "rgba(0,0,0,0.6)",
                      color: "#fff",
                      fontSize: "0.65rem",
                      fontWeight: 700,
                      padding: "2px 6px",
                      borderRadius: "4px",
                    }}
                  >
                    #{index + 1}
                  </span>
                </div>

                {/* Details */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                    <strong style={{ fontSize: "1.05rem" }}>{slide.title || "Untitled slide"}</strong>
                    <span className={slide.isActive ? "pill pill-open" : "pill"}>
                      {slide.isActive ? "Active on hero" : "Hidden"}
                    </span>
                  </div>
                  {slide.caption ? (
                    <p style={{ margin: "0 0 6px", color: "var(--muted)", fontSize: "0.85rem" }}>
                      {slide.caption}
                    </p>
                  ) : null}
                  <small style={{ color: "var(--muted)", fontSize: "0.72rem", wordBreak: "break-all" }}>
                    {slide.imageUrl.startsWith("data:") ? "Uploaded custom file (data URL)" : slide.imageUrl}
                  </small>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                  {/* Reorder Up */}
                  <Form method="post">
                    <input type="hidden" name="intent" value="move-slide" />
                    <input type="hidden" name="slideId" value={slide.id} />
                    <input type="hidden" name="direction" value="up" />
                    <button
                      type="submit"
                      className="button button-muted"
                      disabled={index === 0 || submitting || !canEdit}
                      style={{ minHeight: "36px", padding: "0 12px", fontSize: "0.8rem" }}
                      title="Move up"
                    >
                      ↑
                    </button>
                  </Form>

                  {/* Reorder Down */}
                  <Form method="post">
                    <input type="hidden" name="intent" value="move-slide" />
                    <input type="hidden" name="slideId" value={slide.id} />
                    <input type="hidden" name="direction" value="down" />
                    <button
                      type="submit"
                      className="button button-muted"
                      disabled={index === slides.length - 1 || submitting || !canEdit}
                      style={{ minHeight: "36px", padding: "0 12px", fontSize: "0.8rem" }}
                      title="Move down"
                    >
                      ↓
                    </button>
                  </Form>

                  {/* Toggle active */}
                  <Form method="post">
                    <input type="hidden" name="intent" value="toggle-active" />
                    <input type="hidden" name="slideId" value={slide.id} />
                    <input type="hidden" name="isActive" value={slide.isActive ? "1" : "0"} />
                    <button
                      type="submit"
                      className="button button-muted"
                      disabled={submitting || !canEdit}
                      style={{ minHeight: "36px", padding: "0 14px", fontSize: "0.8rem" }}
                    >
                      {slide.isActive ? "Hide" : "Show"}
                    </button>
                  </Form>

                  {/* Delete */}
                  <Form
                    method="post"
                    onSubmit={(e) => {
                      if (!confirm("Are you sure you want to delete this carousel image?")) {
                        e.preventDefault();
                      }
                    }}
                  >
                    <input type="hidden" name="intent" value="delete-slide" />
                    <input type="hidden" name="slideId" value={slide.id} />
                    <button
                      type="submit"
                      className="button"
                      disabled={submitting || !canEdit}
                      style={{
                        minHeight: "36px",
                        padding: "0 14px",
                        fontSize: "0.8rem",
                        background: "#fee2e2",
                        color: "#991b1b",
                      }}
                    >
                      Delete
                    </button>
                  </Form>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Import / Add New Image Section */}
      <section className="form-card" style={{ maxWidth: "100%", padding: "36px" }}>
        <div style={{ marginBottom: "24px" }}>
          <span className="eyebrow eyebrow-dark">Add to Hero Carousel</span>
          <h2 style={{ margin: "6px 0" }}>Import image to carousel</h2>
          <p style={{ color: "var(--muted)", margin: 0 }}>
            {isFull
              ? "The carousel currently has 5 images (maximum reached). Delete or replace an image to import a new one."
              : `Import an image from the curated gallery, upload a custom file, or enter an image URL (${5 - slides.length} slot${5 - slides.length === 1 ? "" : "s"} remaining).`}
          </p>
        </div>

        {isFull ? (
          <div
            style={{
              padding: "20px",
              borderRadius: "14px",
              background: "#fef3c7",
              color: "#92400e",
              fontWeight: 600,
              fontSize: "0.92rem",
            }}
          >
            ⚠️ Maximum 5 carousel images limit reached. To import a new image, delete an existing slide from the list above.
          </div>
        ) : (
          <div>
            {/* Import Mode Selector */}
            <div style={{ display: "flex", gap: "10px", marginBottom: "24px" }}>
              <button
                type="button"
                onClick={() => setImportMode("preset")}
                className={`button ${importMode === "preset" ? "button-primary" : "button-muted"}`}
                style={{ minHeight: "40px", fontSize: "0.85rem" }}
              >
                Curated Athletic Gallery
              </button>
              <button
                type="button"
                onClick={() => setImportMode("upload")}
                className={`button ${importMode === "upload" ? "button-primary" : "button-muted"}`}
                style={{ minHeight: "40px", fontSize: "0.85rem" }}
              >
                Upload File / Photo
              </button>
              <button
                type="button"
                onClick={() => setImportMode("url")}
                className={`button ${importMode === "url" ? "button-primary" : "button-muted"}`}
                style={{ minHeight: "40px", fontSize: "0.85rem" }}
              >
                Image URL
              </button>
            </div>

            {/* Mode 1: Curated Athletic Gallery */}
            {importMode === "preset" ? (
              <div style={{ marginBottom: "24px" }}>
                <label style={{ display: "block", marginBottom: "12px", fontWeight: 700 }}>
                  Select curated athletic photo:
                </label>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                    gap: "14px",
                  }}
                >
                  {PRESET_GALLERY.map((preset) => {
                    const isSelected = selectedPresetUrl === preset.url;
                    return (
                      <button
                        type="button"
                        key={preset.url}
                        onClick={() => handlePresetSelect(preset)}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          textAlign: "left",
                          padding: "8px",
                          borderRadius: "12px",
                          border: isSelected ? "3px solid var(--purple)" : "1px solid var(--line)",
                          background: isSelected ? "rgba(99, 54, 223, 0.05)" : "var(--surface)",
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <div
                          style={{
                            width: "100%",
                            height: "100px",
                            borderRadius: "8px",
                            overflow: "hidden",
                            marginBottom: "8px",
                          }}
                        >
                          <img
                            src={preset.url}
                            alt={preset.label}
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        </div>
                        <strong style={{ fontSize: "0.85rem", color: isSelected ? "var(--purple)" : "var(--ink)" }}>
                          {preset.label}
                        </strong>
                        <small style={{ color: "var(--muted)", fontSize: "0.72rem" }}>{preset.title}</small>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {/* Mode 2: File Upload */}
            {importMode === "upload" ? (
              <div style={{ marginBottom: "24px" }}>
                <label style={{ display: "block", marginBottom: "8px", fontWeight: 700 }}>
                  Choose image file from your device:
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleFileUpload}
                  style={{
                    display: "block",
                    padding: "10px",
                    border: "1px dashed var(--line)",
                    borderRadius: "10px",
                    width: "100%",
                  }}
                />
                <small style={{ display: "block", marginTop: "6px", color: "var(--muted)" }}>
                  Supports JPEG, PNG, WebP athletic event photos.
                </small>
                {uploadError ? (
                  <p style={{ margin: "6px 0 0", color: "#b91c1c", fontSize: "0.82rem", fontWeight: 600 }}>
                    {uploadError}
                  </p>
                ) : null}
              </div>
            ) : null}

            {/* Mode 3: Image URL */}
            {importMode === "url" ? (
              <div style={{ marginBottom: "24px" }}>
                <label style={{ display: "block", marginBottom: "8px", fontWeight: 700 }}>
                  Image URL (HTTPS):
                </label>
                <input
                  type="url"
                  placeholder="https://images.unsplash.com/... or /images/..."
                  value={customImageUrl}
                  onChange={(e) => setCustomImageUrl(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    borderRadius: "10px",
                    border: "1px solid var(--line)",
                  }}
                />
              </div>
            ) : null}

            {/* Live Gradient Preview of the Selected Slide */}
            {effectiveImageUrl ? (
              <div style={{ marginBottom: "24px" }}>
                <label style={{ display: "block", marginBottom: "8px", fontWeight: 700 }}>
                  Live Hero Gradient Overlay Preview:
                </label>
                <div
                  style={{
                    position: "relative",
                    height: "220px",
                    borderRadius: "20px",
                    overflow: "hidden",
                    display: "flex",
                    alignItems: "center",
                    padding: "30px",
                    color: "white",
                  }}
                >
                  {/* Background Image */}
                  <img
                    src={effectiveImageUrl}
                    alt="Preview"
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                  {/* Matching Hero Brand Gradient Overlay */}
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background:
                        "radial-gradient(circle at 80% 15%, rgba(201, 244, 61, 0.35), transparent 28%), linear-gradient(135deg, rgba(75, 37, 188, 0.88) 0%, rgba(109, 59, 232, 0.82) 55%, rgba(46, 23, 111, 0.94) 100%)",
                    }}
                  />
                  {/* Overlay Content */}
                  <div style={{ position: "relative", zIndex: 1, maxWidth: "600px" }}>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                      <span className="eyebrow" style={{ color: "var(--lime)" }}>
                        Hero preview
                      </span>
                    </div>
                    <h3 style={{ margin: "4px 0 8px", fontSize: "1.5rem", color: "#fff" }}>
                      {title || "Your next start line begins here."}
                    </h3>
                    <p style={{ margin: 0, color: "rgba(255,255,255,0.8)", fontSize: "0.95rem" }}>
                      {caption || "Community athletics, timing, and digital wallet passes."}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Form to submit */}
            <Form method="post">
              <input type="hidden" name="intent" value="add-slide" />
              <input type="hidden" name="imageUrl" value={effectiveImageUrl} />

              <div className="field-grid" style={{ marginBottom: "16px" }}>
                <label>
                  Slide title (optional)
                  <input
                    name="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Dawn Striders"
                  />
                </label>
                <label>
                  Slide caption / subtitle (optional)
                  <input
                    name="caption"
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="e.g. Marathon & 10K road training"
                  />
                </label>
              </div>

              <div className="admin-form-actions">
                <button
                  className="button button-primary"
                  type="submit"
                  disabled={!effectiveImageUrl || submitting || !canEdit}
                >
                  {submitting ? "Importing…" : "Import to hero carousel"}
                </button>
              </div>
            </Form>
          </div>
        )}
      </section>
    </>
  );
}
