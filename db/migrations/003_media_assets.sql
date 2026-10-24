CREATE TABLE IF NOT EXISTS media_assets (
 sha256 text PRIMARY KEY CHECK(sha256 ~ '^[a-f0-9]{64}$'),
 original_sha256 text NOT NULL CHECK(original_sha256 ~ '^[a-f0-9]{64}$'),
 filename text NOT NULL, data_base64 text NOT NULL CHECK(length(data_base64)<4000000),
 provenance text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
