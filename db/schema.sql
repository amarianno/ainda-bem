CREATE TABLE IF NOT EXISTS oauth_tokens (
 provider text PRIMARY KEY,
 channel_id text NOT NULL,
 refresh_token_ciphertext text NOT NULL,
 scopes text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS episodes (
 id text PRIMARY KEY,
 target_publish_at timestamptz NOT NULL,
 status text NOT NULL CHECK (status IN ('QUEUED','RENDERING','RENDERED','VERIFYING','READY','UPLOADING','SCHEDULED','PUBLISHED','BLOCKED','FAILED')),
 script_json jsonb,
 source_manifest jsonb,
 render_asset_url text,
 youtube_video_id text UNIQUE,
 quality_approved boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS episodes_status_idx ON episodes(status,target_publish_at);
CREATE TABLE IF NOT EXISTS audit_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 episode_id text,
 event_type text NOT NULL,
 details jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);
