export type Race = { id: string; name: string; distance: string; capacity: number; remaining: number };
export type EventSummary = {
  slug: string; name: string; summary: string; dateLabel: string; timeLabel: string;
  location: string; visibility: "public" | "private"; races: Race[];
};

export const exampleEvent: EventSummary = {
  slug: "3f-community-run-2026",
  name: "3F Community Run 2026",
  summary: "A welcoming community race for first-time runners, experienced athletes, families, and teams.",
  dateLabel: "16 November 2026",
  timeLabel: "6:00 AM GST",
  location: "Dubai, United Arab Emirates",
  visibility: "public",
  races: [
    { id: "race-5k", name: "Community 5K", distance: "5 km", capacity: 300, remaining: 184 },
    { id: "race-10k", name: "Challenge 10K", distance: "10 km", capacity: 200, remaining: 91 },
  ],
};
