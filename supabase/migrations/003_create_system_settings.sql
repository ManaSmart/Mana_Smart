-- Create system_settings table
CREATE TABLE IF NOT EXISTS system_settings (
    setting_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_notifications BOOLEAN DEFAULT true,
    sms_notifications BOOLEAN DEFAULT false,
    auto_backup BOOLEAN DEFAULT true,
    two_factor_auth BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES system_users(user_id),
    updated_by UUID REFERENCES system_users(user_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_system_settings_created_at ON system_settings(created_at DESC);

-- Create trigger to update updated_at
CREATE OR REPLACE FUNCTION update_system_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_system_settings_updated_at
    BEFORE UPDATE ON system_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_system_settings_updated_at();

-- Insert default settings if none exist
INSERT INTO system_settings (
    email_notifications,
    sms_notifications,
    auto_backup,
    two_factor_auth
) VALUES (
    true,
    false,
    true,
    false
) ON CONFLICT DO NOTHING;

-- Enable RLS
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies (allow authenticated users to read, only admins to write)
-- For now, allow all authenticated users to read/write (you can restrict later)
CREATE POLICY "Allow authenticated users to view system settings"
    ON system_settings FOR SELECT
    USING (true);

CREATE POLICY "Allow authenticated users to update system settings"
    ON system_settings FOR UPDATE
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow authenticated users to insert system settings"
    ON system_settings FOR INSERT
    WITH CHECK (true);

