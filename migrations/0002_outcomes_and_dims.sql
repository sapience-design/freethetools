-- Extended anonymous totals (ADR 0007). Still no identifiers of any kind.
ALTER TABLE counts ADD COLUMN successes INTEGER NOT NULL DEFAULT 0; -- a result was downloaded or copied
ALTER TABLE counts ADD COLUMN errors    INTEGER NOT NULL DEFAULT 0; -- a tool couldn't process the input

-- Site-wide daily totals by one dimension at a time, e.g. ("2026-09-28", "country", "NO", 12).
-- Dimensions are never combined, so no row describes a person.
CREATE TABLE IF NOT EXISTS dims (
  day TEXT    NOT NULL,
  dim TEXT    NOT NULL,  -- "country" | "referrer" | "device"
  key TEXT    NOT NULL,  -- "NO" | "Google" | "phone"
  n   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, dim, key)
);
