-- Migration: Create reminders table for calendar reminders
-- This table stores all manual reminders created by users

CREATE TABLE IF NOT EXISTS reminders (
  reminder_id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  reminder_date DATE NOT NULL,
  reminder_time TIME NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('visit', 'payment', 'contract', 'follow-up', 'other')),
  priority TEXT NOT NULL CHECK (priority IN ('high', 'medium', 'low')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'cancelled')) DEFAULT 'pending',
  customer TEXT,
  assigned_to TEXT,
  completed_at TIMESTAMPTZ,
  related_visit_id UUID,
  related_invoice_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES system_users(user_id),
  updated_by UUID REFERENCES system_users(user_id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_reminders_date ON reminders(reminder_date);
CREATE INDEX IF NOT EXISTS idx_reminders_status ON reminders(status);
CREATE INDEX IF NOT EXISTS idx_reminders_type ON reminders(type);
CREATE INDEX IF NOT EXISTS idx_reminders_created_by ON reminders(created_by);
CREATE INDEX IF NOT EXISTS idx_reminders_updated_by ON reminders(updated_by);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_reminders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER reminders_updated_at
    BEFORE UPDATE ON reminders
    FOR EACH ROW
    EXECUTE FUNCTION update_reminders_updated_at();

-- Add comments for documentation
COMMENT ON TABLE reminders IS 'Stores manual reminders created by users for calendar and scheduling';
COMMENT ON COLUMN reminders.reminder_id IS 'Primary key for the reminder';
COMMENT ON COLUMN reminders.reminder_date IS 'Date when the reminder is scheduled';
COMMENT ON COLUMN reminders.reminder_time IS 'Time when the reminder is scheduled';
COMMENT ON COLUMN reminders.type IS 'Type of reminder: visit, payment, contract, follow-up, or other';
COMMENT ON COLUMN reminders.priority IS 'Priority level: high, medium, or low';
COMMENT ON COLUMN reminders.status IS 'Current status: pending, completed, or cancelled';
COMMENT ON COLUMN reminders.related_visit_id IS 'Optional reference to a visit if this reminder is linked to a visit';
COMMENT ON COLUMN reminders.related_invoice_id IS 'Optional reference to an invoice if this reminder is linked to an invoice';
COMMENT ON COLUMN reminders.created_by IS 'User ID who created this reminder';
COMMENT ON COLUMN reminders.updated_by IS 'User ID who last updated this reminder';

