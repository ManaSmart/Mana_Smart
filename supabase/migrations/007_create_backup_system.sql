-- Create key-value system_settings table for backup configuration
-- This table stores settings as key-value pairs with JSONB values
CREATE TABLE IF NOT EXISTS system_settings_kv (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  key text UNIQUE NOT NULL,
  value jsonb NOT NULL,
  updated_at timestamptz DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_system_settings_kv_key ON system_settings_kv(key);

-- Create trigger to update updated_at
CREATE OR REPLACE FUNCTION update_system_settings_kv_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_system_settings_kv_updated_at
    BEFORE UPDATE ON system_settings_kv
    FOR EACH ROW
    EXECUTE FUNCTION update_system_settings_kv_updated_at();

-- Insert default backup settings
INSERT INTO system_settings_kv (key, value) VALUES
  ('backup_enabled', '{"enabled": false}'::jsonb),
  ('last_backup_at', 'null'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Create backup_history table
CREATE TABLE IF NOT EXISTS backup_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  s3_key text,
  created_at timestamptz DEFAULT now(),
  status text NOT NULL CHECK (status IN ('success', 'failed', 'cancelled', 'in_progress')),
  size_bytes bigint,
  error_text text,
  workflow_run_id text, -- GitHub Actions run ID for tracking
  dispatch_id text -- For manual backups triggered via workflow_dispatch
);

-- Create indexes for backup_history
CREATE INDEX IF NOT EXISTS idx_backup_history_created_at ON backup_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backup_history_status ON backup_history(status);
CREATE INDEX IF NOT EXISTS idx_backup_history_workflow_run_id ON backup_history(workflow_run_id);
CREATE INDEX IF NOT EXISTS idx_backup_history_dispatch_id ON backup_history(dispatch_id);

-- Enable RLS
ALTER TABLE system_settings_kv ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies for system_settings_kv
-- Allow authenticated users to read, only service role to write (via Edge Functions)
CREATE POLICY "Allow authenticated users to view backup settings"
    ON system_settings_kv FOR SELECT
    USING (true);

CREATE POLICY "Allow service role to manage backup settings"
    ON system_settings_kv FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- RLS Policies for backup_history
-- Allow authenticated users to read backup history
CREATE POLICY "Allow authenticated users to view backup history"
    ON backup_history FOR SELECT
    USING (true);

-- Allow service role to insert/update backup history (via GitHub Actions)
CREATE POLICY "Allow service role to manage backup history"
    ON backup_history FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

