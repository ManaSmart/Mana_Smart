/**
 * Logo Migration Helper
 * Helps detect and migrate old S3 logos to Supabase storage
 */

/**
 * Check if a URL is an S3 URL (old storage)
 */
export function isS3Url(url: string | null | undefined): boolean {
	if (!url) return false;
	return url.includes('s3.') || url.includes('amazonaws.com');
}

/**
 * Check if a URL is a Supabase storage URL
 */
export function isSupabaseUrl(url: string | null | undefined): boolean {
	if (!url) return false;
	return url.includes('supabase.co') || url.includes('supabase') || url.includes('storage');
}

/**
 * Detect if logo needs migration from S3 to Supabase
 */
export function logoNeedsMigration(logoUrl: string | null | undefined): boolean {
	return isS3Url(logoUrl);
}

/**
 * Get migration message for old S3 logos
 */
export function getMigrationMessage(): string {
	return 'Your logo is stored in S3. Please re-upload it in Settings to migrate to secure Supabase storage.';
}

