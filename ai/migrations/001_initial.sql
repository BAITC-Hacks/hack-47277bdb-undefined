-- Base schema for a directly managed PostgreSQL instance. No extension is
-- required to apply this migration.

CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID PRIMARY KEY,
  user_id TEXT,
  language TEXT NOT NULL CHECK (language IN ('ru', 'kk', 'en')),
  city TEXT,
  warehouse_id TEXT,
  customer_type TEXT NOT NULL DEFAULT 'retail',
  currency TEXT NOT NULL DEFAULT 'KZT',
  recently_viewed_product_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  active_proposal_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS chat_sessions_expires_idx ON chat_sessions(expires_at);

CREATE TABLE IF NOT EXISTS conversation_messages (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS conversation_messages_session_created_idx ON conversation_messages(session_id, created_at);

CREATE TABLE IF NOT EXISTS cart_proposals (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  owner_user_id TEXT,
  city TEXT NOT NULL,
  warehouse_id TEXT,
  customer_type TEXT NOT NULL CHECK (customer_type IN ('retail', 'wholesale')),
  currency TEXT NOT NULL,
  items JSONB NOT NULL,
  stock_snapshot JSONB NOT NULL,
  subtotal NUMERIC(14, 2) NOT NULL CHECK (subtotal >= 0),
  confirmation_token_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirming', 'confirmed', 'invalidated', 'expired')),
  confirmation_idempotency_key TEXT,
  confirmation JSONB,
  invalidation_reason TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS cart_proposals_session_created_idx ON cart_proposals(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cart_proposals_status_expires_idx ON cart_proposals(status, expires_at);

CREATE TABLE IF NOT EXISTS uploaded_files (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_kind TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  sha256 TEXT NOT NULL,
  storage_key TEXT,
  extracted_data JSONB NOT NULL,
  ignored_instruction_count INTEGER NOT NULL DEFAULT 0 CHECK (ignored_instruction_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS specification_analyses (
  id UUID PRIMARY KEY,
  file_id UUID NOT NULL REFERENCES uploaded_files(id) ON DELETE CASCADE,
  city TEXT NOT NULL,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Plain JSONB keeps the base schema compatible with a normal managed
-- PostgreSQL server. A specialized vector migration can be added later if needed.
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  title TEXT NOT NULL,
  section TEXT NOT NULL,
  content TEXT NOT NULL,
  source_url TEXT NOT NULL,
  language TEXT NOT NULL CHECK (language IN ('ru', 'kk', 'en')),
  document_type TEXT NOT NULL,
  product_id TEXT,
  category TEXT,
  embedding JSONB,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS knowledge_chunks_language_idx ON knowledge_chunks(language, document_type);

CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY,
  session_id UUID,
  request_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor TEXT NOT NULL,
  payload JSONB NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_events_session_idx ON audit_events(session_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS manager_handoffs (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  customer_question TEXT NOT NULL,
  city TEXT,
  product_references JSONB NOT NULL,
  requested_quantity INTEGER,
  checked_information JSONB NOT NULL,
  unresolved_issue TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'assigned', 'resolved')) DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS manager_handoffs_session_created_idx ON manager_handoffs(session_id, created_at DESC);
