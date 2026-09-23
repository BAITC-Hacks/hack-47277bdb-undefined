-- Makes installations created by the earlier schema usable by
-- the direct PostgreSQL runtime. Statements are additive and preserve data.

ALTER TABLE chat_sessions
  ADD COLUMN IF NOT EXISTS recently_viewed_product_ids JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE chat_sessions
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours');
CREATE INDEX IF NOT EXISTS chat_sessions_expires_idx ON chat_sessions(expires_at);

ALTER TABLE cart_proposals ADD COLUMN IF NOT EXISTS owner_user_id TEXT;
ALTER TABLE cart_proposals ADD COLUMN IF NOT EXISTS warehouse_id TEXT;
ALTER TABLE cart_proposals ADD COLUMN IF NOT EXISTS customer_type TEXT NOT NULL DEFAULT 'retail';
ALTER TABLE cart_proposals ADD COLUMN IF NOT EXISTS items JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE cart_proposals ADD COLUMN IF NOT EXISTS stock_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE cart_proposals ADD COLUMN IF NOT EXISTS confirmation_idempotency_key TEXT;
ALTER TABLE cart_proposals ADD COLUMN IF NOT EXISTS confirmation JSONB;
ALTER TABLE cart_proposals ADD COLUMN IF NOT EXISTS invalidation_reason TEXT;
ALTER TABLE cart_proposals ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE cart_proposals ADD COLUMN IF NOT EXISTS confirmation_token_hash TEXT NOT NULL DEFAULT '';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cart_proposals' AND column_name = 'state'
  ) THEN
    EXECUTE $sql$
      UPDATE cart_proposals
      SET status = CASE state
        -- Legacy rows have no JSONB quote/stock snapshots and no safe
        -- confirmation payload, so they must never become confirmable.
        WHEN 'expired' THEN 'expired'
        ELSE 'invalidated'
      END
    $sql$;
  END IF;
END $$;

ALTER TABLE cart_proposals DROP CONSTRAINT IF EXISTS cart_proposals_state_check;
ALTER TABLE cart_proposals DROP CONSTRAINT IF EXISTS cart_proposals_status_check;
ALTER TABLE cart_proposals
  ADD CONSTRAINT cart_proposals_status_check
  CHECK (status IN ('pending', 'confirming', 'confirmed', 'invalidated', 'expired'));
CREATE INDEX IF NOT EXISTS cart_proposals_status_expires_idx ON cart_proposals(status, expires_at);

ALTER TABLE uploaded_files
  ADD COLUMN IF NOT EXISTS ignored_instruction_count INTEGER NOT NULL DEFAULT 0;

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

-- A direct PostgreSQL server need not have a vector extension. Existing vector
-- data is converted to JSON when an older schema is upgraded.
DROP INDEX IF EXISTS knowledge_chunks_embedding_idx;
DO $$
DECLARE
  embedding_type TEXT;
BEGIN
  SELECT data_type INTO embedding_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'knowledge_chunks' AND column_name = 'embedding';

  IF embedding_type = 'USER-DEFINED' THEN
    EXECUTE 'ALTER TABLE knowledge_chunks ALTER COLUMN embedding TYPE JSONB USING CASE WHEN embedding IS NULL THEN NULL ELSE embedding::text::jsonb END';
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS knowledge_chunks_language_idx ON knowledge_chunks(language, document_type);
