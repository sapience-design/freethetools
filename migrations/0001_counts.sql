-- Anonymous totals per tool per day. No identifiers of any kind are stored.
CREATE TABLE IF NOT EXISTS counts (
  tool  TEXT    NOT NULL,           -- e.g. "pdf/compress"
  day   TEXT    NOT NULL,           -- UTC date, "2026-09-28"
  views INTEGER NOT NULL DEFAULT 0, -- tool page opened (once per browser session)
  uses  INTEGER NOT NULL DEFAULT 0, -- tool actually used (once per visit)
  likes INTEGER NOT NULL DEFAULT 0, -- likes added minus likes removed that day
  PRIMARY KEY (tool, day)
);
