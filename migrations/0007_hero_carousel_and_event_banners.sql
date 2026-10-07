-- Phase 5: Hero Carousel and Event Banner Images
ALTER TABLE events ADD COLUMN image_url TEXT;

CREATE TABLE hero_slides (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  image_url TEXT NOT NULL,
  title TEXT,
  caption TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS hero_slides_org_sort_idx ON hero_slides(organization_id, sort_order);

-- Seed default curated 3F Striders athletic hero carousel images (max 5)
INSERT INTO hero_slides (id, organization_id, image_url, title, caption, sort_order, is_active, created_at, updated_at) VALUES
('slide_1', 'org_3fstriders', '/images/hero/slide1_running_dawn.jpg', 'Dawn Striders', 'Community road & marathon training across the UAE', 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('slide_2', 'org_3fstriders', '/images/hero/slide2_triathlon_bike.jpg', 'Speed on the Open Road', 'Time-trial and cycling packs conquering distance', 1, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('slide_3', 'org_3fstriders', '/images/hero/slide3_open_water.jpg', 'Open Water Excellence', 'Triathlon swim legs in sparkling Arabian Gulf waters', 2, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('slide_4', 'org_3fstriders', '/images/hero/slide4_stadium_track.jpg', 'Track Speed & Intervals', 'Precision interval training under evening floodlights', 3, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('slide_5', 'org_3fstriders', '/images/hero/slide5_finish_line.jpg', 'Celebrate Every Finish', 'Every athlete and distance celebrated as one team', 4, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'));

-- Set default banner images for existing sample events
UPDATE events
SET image_url = '/images/presets/slide1_running_dawn.jpg'
WHERE slug = 'dubai-desert-10k-2027';

UPDATE events
SET image_url = '/images/presets/slide4_stadium_track.jpg'
WHERE slug = 'abu-dhabi-sprint-5k';
