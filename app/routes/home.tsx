import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router";

import type { Route } from "./+types/home";
import { listPublishedEvents, listActiveHeroSlides, type HeroSlideRecord } from "../infrastructure/db/event-repository.server";

const FALLBACK_SLIDES: HeroSlideRecord[] = [
  {
    id: "fallback_1",
    organizationId: "org_3fstriders",
    imageUrl: "/images/hero/slide1_running_dawn.jpg",
    title: "Dawn Striders",
    caption: "Community road & marathon training across the UAE",
    sortOrder: 0,
    isActive: true,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "fallback_2",
    organizationId: "org_3fstriders",
    imageUrl: "/images/hero/slide2_triathlon_bike.jpg",
    title: "Speed on the Open Road",
    caption: "Time-trial and cycling packs conquering distance",
    sortOrder: 1,
    isActive: true,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "fallback_3",
    organizationId: "org_3fstriders",
    imageUrl: "/images/hero/slide3_open_water.jpg",
    title: "Open Water Excellence",
    caption: "Triathlon swim legs in sparkling Arabian Gulf waters",
    sortOrder: 2,
    isActive: true,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "fallback_4",
    organizationId: "org_3fstriders",
    imageUrl: "/images/hero/slide4_stadium_track.jpg",
    title: "Track Speed & Intervals",
    caption: "Precision interval training under evening floodlights",
    sortOrder: 3,
    isActive: true,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "fallback_5",
    organizationId: "org_3fstriders",
    imageUrl: "/images/hero/slide5_finish_line.jpg",
    title: "Celebrate Every Finish",
    caption: "Every athlete and distance celebrated as one team",
    sortOrder: 4,
    isActive: true,
    createdAt: "",
    updatedAt: "",
  },
];

export function meta({}: Route.MetaArgs) {
  return [
    { title: "3F Striders Event Registration" },
    {
      name: "description",
      content:
        "Event and race registration platform for 3F Striders, featuring race management, athlete dashboards, organizer tools, and digital passes.",
    },
    { property: "og:title", content: "3F Striders Event Registration" },
    {
      property: "og:description",
      content:
        "Event and race registration platform for 3F Striders, featuring race management, athlete dashboards, organizer tools, and digital passes.",
    },
    { property: "og:image", content: "/images/logo.png" },
  ];
}

export async function loader({}: Route.LoaderArgs) {
  const [events, rawSlides] = await Promise.all([
    listPublishedEvents(),
    listActiveHeroSlides(),
  ]);
  const slides = (rawSlides.length > 0 ? rawSlides : FALLBACK_SLIDES).slice(0, 5);
  return { events, slides };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { events, slides } = loaderData;
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const totalSlides = Math.min(slides.length, 5);

  const handleNext = useCallback(() => {
    setActiveIndex((prev) => (prev + 1) % totalSlides);
  }, [totalSlides]);

  const handlePrev = useCallback(() => {
    setActiveIndex((prev) => (prev - 1 + totalSlides) % totalSlides);
  }, [totalSlides]);

  useEffect(() => {
    if (totalSlides <= 1 || isPaused) return;
    const timer = setInterval(() => {
      handleNext();
    }, 5500);
    return () => clearInterval(timer);
  }, [totalSlides, isPaused, handleNext]);

  const currentSlide = slides[activeIndex] ?? slides[0];

  return (
    <main>
      <section
        className="hero-shell"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        aria-label="Hero carousel"
      >
        {/* Background carousel images with matching brand gradient overlay */}
        <div className="hero-bg-layer" aria-hidden="true">
          {slides.map((slide, idx) => (
            <div
              key={slide.id || idx}
              className={`hero-slide-item ${idx === activeIndex ? "active" : ""}`}
            >
              <img
                src={slide.imageUrl}
                alt={slide.title || "3F Striders athlete photography"}
                className="hero-slide-img"
              />
            </div>
          ))}
          {/* Brand gradient overlay with signature radial & linear gradient */}
          <div className="hero-gradient-overlay" />
        </div>

        {/* Hero copy and registration summary */}
        <div className="hero-grid page-width">
          <div className="hero-copy">
            <div className="hero-kicker-row">
              <img
                src="/images/logo.png"
                alt="3F Striders"
                className="hero-logo-badge"
                width="32"
                height="32"
              />
              <span className="eyebrow">Run · Swim · Bike · Triathlon</span>
            </div>
            <h1>Your next start line begins here.</h1>
            <p>
              Register for 3F Striders events, keep your race information in one place, and carry
              your confirmation in Apple or Google Wallet.
            </p>
            <div className="button-row">
              <a className="button button-primary" href="#events">
                Explore events
              </a>
              <Link className="button button-secondary" to="/dashboard">
                Athlete dashboard
              </Link>
            </div>
          </div>

          <div className="hero-stat-card" aria-label="Registration process">
            <span className="status-dot" />
            <p className="card-kicker">Simple registration</p>
            <ol className="steps-list">
              <li>
                <span>1</span>Verify your email
              </li>
              <li>
                <span>2</span>Complete your entry
              </li>
              <li>
                <span>3</span>Add your wallet pass
              </li>
            </ol>
          </div>
        </div>

        {/* Carousel indicator & navigation bar (up to 5 slides) */}
        {totalSlides > 1 ? (
          <div className="page-width">
            <div className="hero-carousel-bar">
              <div className="carousel-slide-tag">
                <strong>Featured · 0{activeIndex + 1}/0{totalSlides}</strong>
                {currentSlide?.title ? (
                  <span>— {currentSlide.title} {currentSlide.caption ? `(${currentSlide.caption})` : ""}</span>
                ) : null}
              </div>

              <div className="carousel-controls-group">
                {/* Dot indicators */}
                <div className="carousel-dots" role="tablist" aria-label="Hero slide selection">
                  {slides.map((slide, idx) => (
                    <button
                      key={slide.id || idx}
                      type="button"
                      onClick={() => setActiveIndex(idx)}
                      className={`carousel-dot ${idx === activeIndex ? "active" : ""}`}
                      aria-label={`Go to slide ${idx + 1}: ${slide.title || "Athletic photo"}`}
                      aria-selected={idx === activeIndex}
                    />
                  ))}
                </div>

                {/* Pause/Play toggle */}
                <button
                  type="button"
                  onClick={() => setIsPaused((p) => !p)}
                  className="carousel-play-toggle"
                  aria-label={isPaused ? "Resume carousel autoplay" : "Pause carousel autoplay"}
                  title={isPaused ? "Play" : "Pause"}
                >
                  {isPaused ? "▶ Play" : "❚❚ Pause"}
                </button>

                {/* Arrows */}
                <button
                  type="button"
                  onClick={handlePrev}
                  className="carousel-arrow"
                  aria-label="Previous carousel image"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  className="carousel-arrow"
                  aria-label="Next carousel image"
                >
                  ›
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      {/* Events section */}
      <section className="page-width section-space" id="events">
        <div className="section-heading">
          <div>
            <span className="eyebrow eyebrow-dark">Upcoming</span>
            <h2>Find your race</h2>
          </div>
          <p>Times shown in Gulf Standard Time (UTC+4).</p>
        </div>

        {events.length === 0 ? (
          <div className="empty-state public-empty">
            <h3>New events are coming soon</h3>
            <p>Published 3F Striders races will appear here.</p>
          </div>
        ) : (
          events.map((event) => {
            const startsAt = new Date(event.startsAt);
            return (
              <article className="event-card" key={event.id}>
                {/* Event banner visual or standard date visual */}
                {event.imageUrl ? (
                  <div className="event-banner-visual" aria-hidden="true">
                    <img
                      src={event.imageUrl}
                      alt={event.name}
                      className="event-banner-img"
                    />
                    <div className="event-banner-overlay" />
                    <div className="event-banner-date-badge">
                      <strong>
                        {startsAt.toLocaleString("en-AE", { day: "2-digit", timeZone: "Asia/Dubai" })}
                      </strong>
                      <span>
                        {startsAt
                          .toLocaleString("en-AE", { month: "short", timeZone: "Asia/Dubai" })
                          .toUpperCase()}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="event-visual" aria-hidden="true">
                    <span className="event-month">
                      {startsAt
                        .toLocaleString("en-AE", { month: "short", timeZone: "Asia/Dubai" })
                        .toUpperCase()}
                    </span>
                    <strong>
                      {startsAt.toLocaleString("en-AE", { day: "2-digit", timeZone: "Asia/Dubai" })}
                    </strong>
                  </div>
                )}

                <div className="event-content">
                  <div className="pill-row">
                    <span className="pill">Race event</span>
                    <span className="pill pill-open">Registration open</span>
                  </div>
                  <h3>{event.name}</h3>
                  <p>{event.summary}</p>
                  <dl className="event-facts">
                    <div>
                      <dt>Date</dt>
                      <dd>
                        {startsAt.toLocaleString("en-AE", { dateStyle: "long", timeZone: "Asia/Dubai" })}
                      </dd>
                    </div>
                    <div>
                      <dt>Location</dt>
                      <dd>{event.venueName}</dd>
                    </div>
                    <div>
                      <dt>Capacity</dt>
                      <dd>{event.capacity ?? "Unlimited"}</dd>
                    </div>
                  </dl>
                  <Link className="text-link" to={`/events/${event.slug}`}>
                    View event <span aria-hidden="true">→</span>
                  </Link>
                </div>
              </article>
            );
          })
        )}
      </section>
    </main>
  );
}
