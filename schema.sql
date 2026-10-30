-- Shield AP / PrintFlow: Cloudflare D1 schema (database: shield-db)
-- AGENTS.md baseline: users, bookings, media, registry. Approved addition: waitlist (five tables total).
-- Apply: npx wrangler d1 execute shield-db --local --file=schema.sql   (add --remote only when approved)

-- USERS: one list for creators, agents and customers. Column order is business-driven.
CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL DEFAULT '',                         -- first: identify, call, "Hi Name"
  user_type       TEXT NOT NULL DEFAULT 'creator' CHECK (user_type IN ('creator','agent','customer')),
  email           TEXT,
  handle          TEXT,
  token           TEXT NOT NULL UNIQUE,                             -- SHIELD-XXXXXXXX (credential)
  tier            TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free','monthly_49','annual_399','sovereign')),
  vault_status    TEXT NOT NULL DEFAULT 'empty' CHECK (vault_status IN ('empty','active')),  -- files live in media
  website_link    TEXT,                                             -- Shield Bolt target
  location_city   TEXT,
  availability    TEXT,                                             -- JSON: irl, virtual, dates, protocols
  payout_btc      TEXT,
  payout_fiat     TEXT,                                             -- fiat account / Wompi
  services        TEXT,                                             -- JSON: services + prices set by the creator
  last_scan_at    TEXT,
  scan_summary    TEXT,                                             -- JSON of last scan counts
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_handle ON users(handle);
CREATE INDEX IF NOT EXISTS idx_users_email  ON users(email);

-- BOOKINGS: status is the state machine from AGENTS.md, in order.
CREATE TABLE IF NOT EXISTS bookings (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  buyer_id              INTEGER REFERENCES users(id),
  creator_id            INTEGER REFERENCES users(id),
  service               TEXT NOT NULL,
  price_usd             REAL NOT NULL,
  creator_cut_usd       REAL NOT NULL,                              -- 70%
  shield_cut_usd        REAL NOT NULL,                              -- 30%
  status                TEXT NOT NULL DEFAULT 'purchased' CHECK (status IN
                          ('purchased','photo received','image generated','image sent',
                           'post confirmed','influencer comment confirmed','payment released')),
  photo_media_id        INTEGER REFERENCES media(id),
  image_media_id        INTEGER REFERENCES media(id),
  post_url              TEXT,
  influencer_comment_id TEXT UNIQUE,                                -- proof required for payment release
  payment_released_at   TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);

-- MEDIA: metadata and R2 keys only, never file contents.
CREATE TABLE IF NOT EXISTS media (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER REFERENCES users(id),
  kind          TEXT NOT NULL CHECK (kind IN ('video','pic','voice','link','ai_image','staff_photo','snapshot')),
  r2_key        TEXT,                                               -- NULL for links
  url           TEXT,                                               -- for kind = link
  content_type  TEXT,
  bytes         INTEGER,
  retention     TEXT NOT NULL DEFAULT 'vault' CHECK (retention IN ('ephemeral','vault','permanent')),
  delete_after  TEXT,                                               -- set for ephemeral AI images after delivery
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_media_user ON media(user_id, kind);

-- REGISTRY: ledger of leaks and snapshots. Leak status: detected -> claimed -> filed -> removed.
CREATE TABLE IF NOT EXISTS registry (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  kind        TEXT NOT NULL CHECK (kind IN ('leak','snapshot')),
  subject     TEXT NOT NULL,                                        -- domain / URL
  source      TEXT,
  status      TEXT NOT NULL DEFAULT 'detected' CHECK (status IN ('detected','claimed','filed','removed','archived')),
  media_id    INTEGER REFERENCES media(id),                         -- snapshot object
  filing_ref  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, kind, subject)
);

-- WAITLIST (approved addition).
CREATE TABLE IF NOT EXISTS waitlist (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT NOT NULL DEFAULT '',
  user_type         TEXT NOT NULL DEFAULT 'creator' CHECK (user_type IN ('creator','agent','customer')),
  email             TEXT NOT NULL UNIQUE,
  handle            TEXT NOT NULL,
  tier_interest     TEXT NOT NULL DEFAULT 'free' CHECK (tier_interest IN ('free','monthly_49','annual_399')),
  token_issued      TEXT,
  converted_to_user INTEGER NOT NULL DEFAULT 0,
  ip_hash           TEXT,                                           -- rate limiting
  source            TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_waitlist_ip ON waitlist(ip_hash, created_at);
