import { supabase } from './supabaseClient';
import { STORAGE_BUCKETS } from '../../supabase/models/file_metadata';

/**
 * Bucket configuration interface
 */
export interface BucketConfig {
	id: string;
	name: string;
	public: boolean;
	file_size_limit?: number; // in bytes
	allowed_mime_types?: string[];
}

/**
 * All bucket configurations
 */
export const BUCKET_CONFIGS: BucketConfig[] = [
	{
		id: STORAGE_BUCKETS.PROFILE_PICTURES,
		name: 'Profile Pictures',
		public: true,
		file_size_limit: 5 * 1024 * 1024, // 5 MB
		allowed_mime_types: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
	},
	{
		id: STORAGE_BUCKETS.CONTRACTS,
		name: 'Contract Files',
		public: false,
		file_size_limit: 10 * 1024 * 1024, // 10 MB
		allowed_mime_types: ['application/pdf'],
	},
	{
		id: STORAGE_BUCKETS.INVENTORY,
		name: 'Inventory Images',
		public: true,
		file_size_limit: 5 * 1024 * 1024, // 5 MB
		allowed_mime_types: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
	},
	{
		id: STORAGE_BUCKETS.EMPLOYEES,
		name: 'Employee Files',
		public: false,
		file_size_limit: 10 * 1024 * 1024, // 10 MB
		allowed_mime_types: [
			'image/jpeg',
			'image/jpg',
			'image/png',
			'image/webp',
			'application/pdf',
			'application/msword',
			'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		],
	},
	{
		id: STORAGE_BUCKETS.BRANDING,
		name: 'Branding Files',
		public: true,
		file_size_limit: 2 * 1024 * 1024, // 2 MB
		allowed_mime_types: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/svg+xml'],
	},
	{
		id: STORAGE_BUCKETS.PAYROLL,
		name: 'Payroll Documents',
		public: false,
		file_size_limit: 10 * 1024 * 1024, // 10 MB
		allowed_mime_types: [
			'application/pdf',
			'application/vnd.ms-excel',
			'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		],
	},
	{
		id: STORAGE_BUCKETS.ASSETS,
		name: 'Asset Files',
		public: false,
		file_size_limit: 20 * 1024 * 1024, // 20 MB
		allowed_mime_types: [
			'application/pdf',
			'image/jpeg',
			'image/jpg',
			'image/png',
			'application/msword',
			'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		],
	},
	{
		id: STORAGE_BUCKETS.CUSTODY,
		name: 'Custody Documents',
		public: false,
		file_size_limit: 10 * 1024 * 1024, // 10 MB
		allowed_mime_types: ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'],
	},
];

/**
 * Create a single bucket in Supabase Storage
 */
export async function createBucket(config: BucketConfig): Promise<{ success: boolean; error?: string }> {
	try {
		// Check if bucket already exists
		const { data: existingBuckets, error: listError } = await supabase.storage.listBuckets();

		if (listError) {
			return { success: false, error: `Failed to list buckets: ${listError.message}` };
		}

		const bucketExists = existingBuckets?.some((b) => b.id === config.id);

		if (bucketExists) {
			console.log(`Bucket "${config.id}" already exists, skipping creation.`);
			return { success: true };
		}

		// Create bucket via SQL (using RPC or direct SQL)
		// Note: Supabase JS client doesn't have a direct method to create buckets
		// You need to use the SQL API or Dashboard
		// This function provides the SQL command to run

		return {
			success: false,
			error: 'Bucket creation must be done via SQL. See createBucketsSQL() function for the SQL command.',
		};
	} catch (error: any) {
		return { success: false, error: error.message || 'Unknown error occurred' };
	}
}

/**
 * Generate SQL command to create all buckets
 */
export function createBucketsSQL(): string {
	const sqlStatements = BUCKET_CONFIGS.map((config) => {
		const mimeTypes = config.allowed_mime_types
			? `ARRAY[${config.allowed_mime_types.map((t) => `'${t}'`).join(', ')}]`
			: 'NULL';

		return `INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  '${config.id}',
  '${config.name}',
  ${config.public},
  ${config.file_size_limit || 'NULL'},
  ${mimeTypes}
)
ON CONFLICT (id) DO UPDATE
SET 
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;`;
	});

	return sqlStatements.join('\n\n');
}

/**
 * Check if all required buckets exist
 */
export async function checkBucketsExist(): Promise<{
	allExist: boolean;
	missing: string[];
	existing: string[];
}> {
	try {
		const { data: buckets, error } = await supabase.storage.listBuckets();

		if (error) {
			throw error;
		}

		const existingBucketIds = (buckets || []).map((b) => b.id);
		const requiredBucketIds = BUCKET_CONFIGS.map((c) => c.id);
		const missing = requiredBucketIds.filter((id) => !existingBucketIds.includes(id));
		const existing = requiredBucketIds.filter((id) => existingBucketIds.includes(id));

		return {
			allExist: missing.length === 0,
			missing,
			existing,
		};
	} catch (error: any) {
		console.error('Error checking buckets:', error);
		return {
			allExist: false,
			missing: BUCKET_CONFIGS.map((c) => c.id),
			existing: [],
		};
	}
}

