export interface FileMetadata {
	id: string; // UUID
	owner_id: string; // UUID - references owner (user, employee, customer, etc.)
	owner_type: string; // 'user', 'employee', 'customer', 'contract', 'inventory', 'asset', etc.
	category: string; // 'profile_picture', 'contract_file', 'inventory_image', etc.
	bucket: string; // Supabase storage bucket name
	path: string; // Full path in bucket
	file_name: string; // Original file name
	mime_type: string; // e.g., 'image/jpeg', 'application/pdf'
	size: number; // File size in bytes
	width: number | null; // For images only
	height: number | null; // For images only
	description: string | null; // Optional description
	is_public: boolean; // Whether file is publicly accessible
	metadata: Record<string, any> | null; // Additional metadata as JSON
	created_at: string | null; // timestamptz
	updated_at: string | null; // timestamptz
	created_by: string | null; // UUID - User who uploaded the file
	deleted_at: string | null; // timestamptz - Soft delete timestamp
}

export type FileMetadataInsert = Omit<FileMetadata, 'id' | 'created_at' | 'updated_at'> & {
	id?: string;
	created_at?: string | null;
	updated_at?: string | null;
};

export type FileMetadataUpdate = Partial<FileMetadata> & { id: string };

// File category constants
export const FILE_CATEGORIES = {
	PROFILE_PICTURE: 'profile_picture',
	CONTRACT_FILE: 'contract_file',
	INVENTORY_IMAGE: 'inventory_image',
	EMPLOYEE_PICTURE: 'employee_picture',
	EMPLOYEE_DOCUMENT: 'employee_document',
	BRANDING_LOGO: 'branding_logo',
	BRANDING_STAMP: 'branding_stamp',
	PAYROLL_DOCUMENT: 'payroll_document',
	ASSET_FILE: 'asset_file',
	CUSTODY_DOCUMENT: 'custody_document',
} as const;

export type FileCategory = typeof FILE_CATEGORIES[keyof typeof FILE_CATEGORIES];

// Bucket names
export const STORAGE_BUCKETS = {
	PROFILE_PICTURES: 'profile-pictures',
	CONTRACTS: 'contracts',
	INVENTORY: 'inventory',
	EMPLOYEES: 'employees',
	BRANDING: 'branding',
	PAYROLL: 'payroll',
	ASSETS: 'assets',
	CUSTODY: 'custody',
	S3: 's3', // AWS S3 storage provider identifier
} as const;

export type StorageBucket = typeof STORAGE_BUCKETS[keyof typeof STORAGE_BUCKETS];

