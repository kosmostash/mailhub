// The MailHub schema, as a module rather than a .sql file so that it survives
// bundling unchanged - the API build, the workers and the test suite all read
// it the same way, with no asset-copying step to keep in sync.
export const schema = /* sql */ `
-- MailHub schema.
--
-- One \`users\` table for all three roles, as the spec recommends (§2.1): email
-- uniqueness across roles is then a single index, and sign-in looks in one
-- place. A partial unique index enforces "at most one superadmin".

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  role          TEXT NOT NULL CHECK (role IN ('superadmin', 'admin', 'operator')),
  email         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  -- operators only: the admin they belong to (§2.1)
  admin_id      TEXT REFERENCES users (id),
  disabled_at   TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  CHECK ((role = 'operator') = (admin_id IS NOT NULL))
);

CREATE UNIQUE INDEX users_email_key ON users (email);
CREATE UNIQUE INDEX users_one_superadmin ON users (role) WHERE role = 'superadmin';
CREATE INDEX users_admin_id_idx ON users (admin_id);

-- Sessions are server-side so that disabling an account can revoke them
-- immediately (§2.1.5). \`id\` holds the SHA-256 of the cookie token, never the
-- token itself.
CREATE TABLE sessions (
  id                   TEXT PRIMARY KEY,
  user_id              TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- set while the session is impersonating someone (§2.2); one level, no nesting
  impersonated_user_id TEXT REFERENCES users (id) ON DELETE CASCADE,
  created_at           TEXT NOT NULL,
  expires_at           TEXT NOT NULL,
  last_seen_at         TEXT NOT NULL
);

CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_impersonated_idx ON sessions (impersonated_user_id);

-- Providers belong to an admin (§2.4): delivery credentials are infrastructure.
CREATE TABLE providers (
  id         TEXT PRIMARY KEY,
  admin_id   TEXT NOT NULL REFERENCES users (id),
  name       TEXT NOT NULL,
  type       TEXT NOT NULL,
  config     TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX providers_admin_name_key ON providers (admin_id, name);
CREATE INDEX providers_admin_idx ON providers (admin_id);

-- A collection's id doubles as its API key (§2.3), so it never changes -
-- reassignment stays invisible to client projects (§2.1.6).
CREATE TABLE collections (
  id            TEXT PRIMARY KEY,
  operator_id   TEXT NOT NULL REFERENCES users (id),
  name          TEXT NOT NULL,
  schedule_mode TEXT NOT NULL CHECK (schedule_mode IN ('after_review', 'immediate')),
  provider_id   TEXT REFERENCES providers (id),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE UNIQUE INDEX collections_operator_name_key ON collections (operator_id, name);
CREATE INDEX collections_operator_idx ON collections (operator_id);
CREATE INDEX collections_provider_idx ON collections (provider_id);

CREATE TABLE emails (
  id                  TEXT PRIMARY KEY,
  collection_id       TEXT NOT NULL REFERENCES collections (id) ON DELETE CASCADE,
  from_address        TEXT NOT NULL,
  from_name           TEXT,
  to_addresses        TEXT NOT NULL,
  cc_addresses        TEXT,
  bcc_addresses       TEXT,
  subject             TEXT NOT NULL,
  text_body           TEXT,
  html_body           TEXT,
  -- pending -> ready -> sent, and nothing else (§2.7)
  state               TEXT NOT NULL CHECK (state IN ('pending', 'ready', 'sent')),
  -- orthogonal to state: what the provider reported (§2.7)
  delivery_status     TEXT NOT NULL CHECK (delivery_status IN ('unknown', 'sent', 'delivered', 'bounced')),
  attempts            INTEGER NOT NULL DEFAULT 0,
  last_error          TEXT,
  provider_message_id TEXT,
  source              TEXT NOT NULL CHECK (source IN ('http', 'smtp')),
  created_at          TEXT NOT NULL,
  reviewed_at         TEXT,
  sent_at             TEXT,
  CHECK (text_body IS NOT NULL OR html_body IS NOT NULL)
);

CREATE INDEX emails_collection_idx ON emails (collection_id, created_at DESC);
CREATE INDEX emails_state_idx ON emails (state, created_at);
CREATE INDEX emails_message_id_idx ON emails (provider_message_id);

-- Personal belongings of an operator: they never move on reassignment (§2.1.6).
CREATE TABLE test_addresses (
  id          TEXT PRIMARY KEY,
  operator_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  address     TEXT NOT NULL,
  label       TEXT,
  created_at  TEXT NOT NULL
);

CREATE INDEX test_addresses_operator_idx ON test_addresses (operator_id, created_at DESC);

-- The trail is history, not property: rows are never reassigned or rewritten,
-- and the scope columns are denormalised at write time (§2.6).
CREATE TABLE activity (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  action              TEXT NOT NULL,
  object_type         TEXT NOT NULL,
  object_id           TEXT,
  object_label        TEXT,
  actor_kind          TEXT NOT NULL CHECK (actor_kind IN ('user', 'sender', 'smtp')),
  actor_id            TEXT,
  actor_email         TEXT,
  actor_role          TEXT,
  impersonator_id     TEXT,
  impersonator_email  TEXT,
  impersonator_role   TEXT,
  scope_admin_id      TEXT,
  scope_operator_id   TEXT,
  detail              TEXT,
  created_at          TEXT NOT NULL
);

CREATE INDEX activity_scope_admin_idx ON activity (scope_admin_id, id DESC);
CREATE INDEX activity_scope_operator_idx ON activity (scope_operator_id, id DESC);

-- System email is a category apart (§2.1.8): never a collection, never queued,
-- always recorded - which is what rate limiting reads.
CREATE TABLE system_emails (
  id         TEXT PRIMARY KEY,
  recipient  TEXT NOT NULL,
  purpose    TEXT NOT NULL,
  user_id    TEXT,
  delivered  INTEGER NOT NULL DEFAULT 0,
  error      TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX system_emails_recipient_idx ON system_emails (recipient, created_at DESC);
CREATE INDEX system_emails_user_idx ON system_emails (user_id, created_at DESC);

-- The credential-change gate (§2.1.7). The pending value is held here and
-- applied only when the code is confirmed.
CREATE TABLE confirmation_codes (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  purpose           TEXT NOT NULL CHECK (purpose IN ('email', 'password')),
  code_hash         TEXT NOT NULL,
  new_email         TEXT,
  new_password_hash TEXT,
  attempts          INTEGER NOT NULL DEFAULT 0,
  expires_at        TEXT NOT NULL,
  consumed_at       TEXT,
  created_at        TEXT NOT NULL
);

CREATE INDEX confirmation_codes_user_idx ON confirmation_codes (user_id, purpose, created_at DESC);
`;
