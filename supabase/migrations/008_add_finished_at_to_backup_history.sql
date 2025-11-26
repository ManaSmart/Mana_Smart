-- Add finished_at column to backup_history table
ALTER TABLE backup_history 
ADD COLUMN IF NOT EXISTS finished_at timestamptz;

-- Create index for finished_at
CREATE INDEX IF NOT EXISTS idx_backup_history_finished_at ON backup_history(finished_at DESC);

