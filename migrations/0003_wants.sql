-- "I want this" votes for tools that are planned but not built yet. One row per tool per UTC day.
-- No identifiers of any kind are stored.
CREATE TABLE IF NOT EXISTS wants (
  tool TEXT    NOT NULL,            -- e.g. "pdf/page-delete": the address the tool will have
  day  TEXT    NOT NULL,            -- UTC date, "2026-10-10"
  n    INTEGER NOT NULL DEFAULT 0,  -- votes that day, up to a daily ceiling
  PRIMARY KEY (tool, day)
);
