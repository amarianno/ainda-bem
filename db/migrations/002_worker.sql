ALTER TABLE episodes ADD COLUMN IF NOT EXISTS render_path text;
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS render_sha256 text;
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS upload_session_ciphertext text;
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS lease_until timestamptz;
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS last_error text;
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS public_approved_at timestamptz;
CREATE TABLE IF NOT EXISTS worker_heartbeats (id text PRIMARY KEY,updated_at timestamptz NOT NULL DEFAULT now());
