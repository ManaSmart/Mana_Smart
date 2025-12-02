-- Create a function to update backup_history that bypasses RLS
-- This function runs with SECURITY DEFINER, so it can update regardless of RLS policies
CREATE OR REPLACE FUNCTION update_backup_history(
  p_backup_id uuid,
  p_status text DEFAULT NULL,
  p_s3_key text DEFAULT NULL,
  p_size_bytes bigint DEFAULT NULL,
  p_workflow_run_id text DEFAULT NULL,
  p_error_text text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
BEGIN
  UPDATE backup_history
  SET
    status = COALESCE(p_status, status),
    s3_key = COALESCE(p_s3_key, s3_key),
    size_bytes = COALESCE(p_size_bytes, size_bytes),
    workflow_run_id = COALESCE(p_workflow_run_id, workflow_run_id),
    error_text = COALESCE(p_error_text, error_text),
    finished_at = CASE WHEN p_status = 'success' THEN NOW() ELSE finished_at END
  WHERE id = p_backup_id;
  
  -- Return the updated row
  SELECT row_to_json(b.*)::jsonb
  INTO v_result
  FROM backup_history b
  WHERE b.id = p_backup_id;
  
  RETURN v_result;
END;
$$;

-- Grant execute permission to service_role and authenticated users
GRANT EXECUTE ON FUNCTION update_backup_history TO service_role;
GRANT EXECUTE ON FUNCTION update_backup_history TO authenticated;
GRANT EXECUTE ON FUNCTION update_backup_history TO anon;

COMMENT ON FUNCTION update_backup_history IS 'Updates backup_history table, bypassing RLS policies. Used by GitHub Actions workflow.';

