import { supabase } from './supabaseClient';
import type { FileMetadata, FileMetadataInsert, FileCategory, StorageBucket } from '../../supabase/models/file_metadata';
import { FILE_CATEGORIES, STORAGE_BUCKETS } from '../../supabase/models/file_metadata';
import { uploadFileToS3, getFileUrlFromS3, deleteFileFromS3 } from './s3Storage';

// Storage provider configuration
const STORAGE_PROVIDER = (import.meta.env.VITE_STORAGE_PROVIDER || 'supabase').toLowerCase();

export interface UploadFileOptions {
	file: File;
	category: FileCategory;
	ownerId: string;
	ownerType: string;
	bucket?: StorageBucket; // Optional - will be auto-determined from category if not provided
	path?: string; // Optional custom path, otherwise auto-generated
	description?: string;
	isPublic?: boolean; // Optional - will be auto-determined from category if not provided
	metadata?: Record<string, any>;
	userId?: string; // User uploading the file
}

export interface UploadFileResult {
	success: boolean;
	fileMetadata?: FileMetadata;
	error?: string;
	publicUrl?: string;
	signedUrl?: string;
}

/**
 * Upload a file to storage (Supabase or S3) and create metadata record
 */
export async function uploadFile(options: UploadFileOptions): Promise<UploadFileResult> {
	// Route to appropriate storage provider
	if (STORAGE_PROVIDER === 's3') {
		return uploadFileToS3(options);
	}
	// Default to Supabase
	return uploadFileToSupabase(options);
}

/**
 * Upload logo to S3 storage (uses S3, regardless of STORAGE_PROVIDER setting)
 * Logos are stored in S3 with presigned URLs for secure access
 */
export async function uploadLogoToS3(options: UploadFileOptions): Promise<UploadFileResult> {
	// Force S3 storage for logos
	const s3Options: UploadFileOptions = {
		...options,
		bucket: STORAGE_BUCKETS.S3, // Force S3 bucket
		isPublic: false, // Use presigned URLs (more secure)
		metadata: {
			...(options.metadata || {}),
			secured: true, // Mark as secured
			uploaded_via: 's3_storage', // Track storage method
		},
	};
	
	return uploadFileToS3(s3Options);
}

/**
 * Upload a file to Supabase Storage and create metadata record
 */
async function uploadFileToSupabase(options: UploadFileOptions): Promise<UploadFileResult> {
	try {
		const {
			file,
			category,
			ownerId,
			ownerType,
			bucket: providedBucket,
			path: customPath,
			description,
			isPublic: providedIsPublic,
			metadata,
			userId,
		} = options;

		// Automatically determine bucket from category if not provided
		const bucket = providedBucket || getBucketForCategory(category);

		// Automatically determine public access from category if not provided
		const isPublic = providedIsPublic !== undefined ? providedIsPublic : getPublicAccessForCategory(category);

		// Generate file path if not provided
		const filePath = customPath || generateFilePath(category, ownerId, file.name);

		// Upload file to Supabase Storage
		const { data: uploadData, error: uploadError } = await supabase.storage
			.from(bucket)
			.upload(filePath, file, {
				cacheControl: '3600',
				upsert: false, // Don't overwrite existing files
			});

		if (uploadError) {
			console.error('Supabase upload error:', {
				error: uploadError,
				bucket,
				filePath,
				fileName: file.name,
				message: uploadError.message,
			});
			return {
				success: false,
				error: `Upload failed: ${uploadError.message}`,
			};
		}

		console.log('File uploaded successfully:', {
			bucket,
			filePath,
			uploadData,
		});

		// Verify the file exists by listing it (helps debug if upload actually succeeded)
		try {
			const { data: listData, error: listError } = await supabase.storage
				.from(bucket)
				.list(filePath.split('/').slice(0, -1).join('/') || '', {
					limit: 100,
					search: filePath.split('/').pop(),
				});
			
			if (listError) {
				console.warn('Could not verify file existence (this is OK, file may still be processing):', listError.message);
			} else {
				const fileName = filePath.split('/').pop();
				const fileExists = listData?.some(file => file.name === fileName);
				console.log('File existence check:', {
					filePath,
					fileName,
					fileExists,
					listedFiles: listData?.map(f => f.name),
				});
			}
		} catch (verifyError) {
			console.warn('File verification check failed (non-critical):', verifyError);
		}

		// Get image dimensions if it's an image
		let width: number | null = null;
		let height: number | null = null;

		if (file.type.startsWith('image/')) {
			const dimensions = await getImageDimensions(file);
			width = dimensions.width;
			height = dimensions.height;
		}

		// Create file metadata record
		const fileMetadata: FileMetadataInsert = {
			owner_id: ownerId,
			owner_type: ownerType,
			category,
			bucket,
			path: filePath,
			file_name: file.name,
			mime_type: file.type,
			size: file.size,
			width,
			height,
			description: description || null,
			is_public: isPublic,
			metadata: metadata || null,
			created_by: userId || null,
			deleted_at: null,
		};

		// Log what we're trying to insert for debugging
		console.log('Attempting to insert file metadata:', {
			ownerId,
			ownerType,
			userId,
			category,
			bucket,
			path: filePath,
		});

		const { data: metadataData, error: metadataError } = await supabase
			.from('file_metadata')
			.insert(fileMetadata)
			.select()
			.single();

		if (metadataError) {
			// If metadata insert fails, try to delete the uploaded file
			try {
				await supabase.storage.from(bucket).remove([filePath]);
			} catch (cleanupError) {
				console.error('Failed to cleanup uploaded file:', cleanupError);
			}
			
			console.error('File metadata insert error details:', {
				error: metadataError,
				errorCode: metadataError.code,
				errorMessage: metadataError.message,
				errorDetails: metadataError.details,
				errorHint: metadataError.hint,
				fileMetadata,
				ownerId,
				userId,
				ownerIdType: typeof ownerId,
				userIdType: typeof userId,
			});
			
			return {
				success: false,
				error: `Failed to create metadata: ${metadataError.message} (Code: ${metadataError.code}). Please check RLS policies - run FIX_ALL_RLS_ISSUES.sql in Supabase SQL Editor.`,
			};
		}

		// Get public URL or signed URL
		let publicUrl: string | undefined;
		let signedUrl: string | undefined;

		if (isPublic) {
			const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(filePath);
			publicUrl = publicUrlData.publicUrl;
		} else {
			// Generate signed URL (valid for 1 hour)
			// Note: Supabase sometimes needs significant time after upload before signed URLs work
			// This is a known issue with Supabase Storage - files may not be immediately available for signed URL generation
			// Retry with longer exponential backoff
			let signedUrlData: { signedUrl: string } | null = null;
			let lastError: any = null;
			const maxRetries = 4;
			const delays = [1000, 2000, 3000, 5000]; // Longer delays: 1s, 2s, 3s, 5s
			
			// Initial delay before first attempt
			await new Promise(resolve => setTimeout(resolve, 1000));
			
			for (let attempt = 0; attempt <= maxRetries; attempt++) {
				if (attempt > 0) {
					const delay = delays[attempt - 1] || 5000;
					console.log(`Retrying signed URL creation (attempt ${attempt + 1}/${maxRetries + 1}) after ${delay}ms delay...`);
					await new Promise(resolve => setTimeout(resolve, delay));
				}
				
				const { data, error } = await supabase.storage
					.from(bucket)
					.createSignedUrl(filePath, 3600);
				
				if (error) {
					lastError = error;
					console.warn(`Signed URL creation attempt ${attempt + 1} failed:`, {
						error: error.message,
						errorCode: (error as any).statusCode || (error as any).code,
						bucket,
						filePath,
					});
					
					// If it's not "Object not found", don't retry (it's a different error like RLS/permissions)
					if (error.message !== 'Object not found' && !error.message.includes('not found')) {
						console.error('Non-retryable error (likely RLS/permissions issue):', {
							error: error.message,
							errorCode: (error as any).statusCode || (error as any).code,
							hint: 'This may be an RLS policy issue. Check that authenticated users can create signed URLs for the branding bucket.',
						});
						break;
					}
				} else {
					signedUrlData = data;
					signedUrl = data?.signedUrl;
					console.log(`✅ Successfully created signed URL on attempt ${attempt + 1}`);
					break;
				}
			}
			
			if (!signedUrlData && lastError) {
				console.warn('⚠️ All signed URL creation attempts failed. File is uploaded but URL will need to be fetched later:', {
					error: lastError.message,
					bucket,
					filePath,
					hint: 'The file was uploaded successfully. The URL can be fetched later using getFileUrl(). This is a known Supabase timing issue - files may take a few seconds to be available for signed URL generation.',
				});
				// Don't fail the upload - the file is uploaded, URL can be fetched later
				// The Settings component will handle fetching the URL as a fallback
			}
		}

		return {
			success: true,
			fileMetadata: metadataData,
			publicUrl,
			signedUrl,
		};
	} catch (error: any) {
		return {
			success: false,
			error: error.message || 'Unknown error occurred',
		};
	}
}

/**
 * Get file URL (public or signed) - supports both Supabase and S3
 */
export async function getFileUrl(
	bucket: StorageBucket,
	path: string,
	isPublic: boolean,
	expiresIn: number = 3600
): Promise<string | null> {
	// Check if file is stored in S3 (bucket will be 's3' for S3 files)
	// Prioritize bucket over global provider setting - bucket is the source of truth
	if (bucket === STORAGE_BUCKETS.S3) {
		return getFileUrlFromS3(path, isPublic, expiresIn);
	}
	
	// For all other buckets (including 'branding'), use Supabase
	// Note: Even if STORAGE_PROVIDER is 's3', if the bucket is a Supabase bucket, use Supabase
	try {
		if (isPublic) {
			const { data } = supabase.storage.from(bucket).getPublicUrl(path);
			return data.publicUrl;
		} else {
			const { data, error } = await supabase.storage
				.from(bucket)
				.createSignedUrl(path, expiresIn);

			if (error) {
				console.error('Error creating signed URL:', error);
				return null;
			}

			return data?.signedUrl || null;
		}
	} catch (error) {
		console.error('Error getting file URL:', error);
		return null;
	}
}

/**
 * Get file metadata by ID
 */
export async function getFileMetadata(fileId: string): Promise<FileMetadata | null> {
	try {
		const { data, error } = await supabase
			.from('file_metadata')
			.select('*')
			.eq('id', fileId)
			.is('deleted_at', null)
			.single();

		if (error) {
			// PGRST116 means no rows found - this is expected if file was deleted or doesn't exist
			if (error.code === 'PGRST116') {
				console.warn('File metadata not found (may have been deleted):', fileId);
			} else {
				console.error('Error fetching file metadata:', error);
			}
			return null;
		}

		return data;
	} catch (error) {
		console.error('Error getting file metadata:', error);
		return null;
	}
}

/**
 * Get files by owner and category
 */
export async function getFilesByOwner(
	ownerId: string,
	ownerType: string,
	category?: FileCategory
): Promise<FileMetadata[]> {
	try {
		let query = supabase
			.from('file_metadata')
			.select('*')
			.eq('owner_id', ownerId)
			.eq('owner_type', ownerType)
			.is('deleted_at', null)
			.order('created_at', { ascending: false });

		if (category) {
			query = query.eq('category', category);
		}

		const { data, error } = await query;

		if (error) {
			console.error('Error fetching files:', error);
			return [];
		}

		return data || [];
	} catch (error) {
		console.error('Error getting files:', error);
		return [];
	}
}

/**
 * Delete a file (soft delete)
 */
export async function deleteFile(fileId: string): Promise<boolean> {
	try {
		// Get file metadata
		const fileMetadata = await getFileMetadata(fileId);
		if (!fileMetadata) {
			return false;
		}

		// Soft delete metadata
		const { error: metadataError } = await supabase
			.from('file_metadata')
			.update({ deleted_at: new Date().toISOString() })
			.eq('id', fileId);

		if (metadataError) {
			console.error('Error deleting file metadata:', metadataError);
			return false;
		}

		// Delete file from storage (Supabase or S3)
		// Prioritize bucket over global provider setting - bucket is the source of truth
		if (fileMetadata.bucket === STORAGE_BUCKETS.S3) {
			// Delete from S3
			const deleted = await deleteFileFromS3(fileMetadata.path);
			if (!deleted) {
				console.error('Error deleting file from S3');
			}
		} else {
			// Delete from Supabase (for all other buckets including 'branding')
			// Note: Even if STORAGE_PROVIDER is 's3', if the bucket is a Supabase bucket, delete from Supabase
			const { error: storageError } = await supabase.storage
				.from(fileMetadata.bucket)
				.remove([fileMetadata.path]);

			if (storageError) {
				console.error('Error deleting file from Supabase storage:', {
					error: storageError,
					bucket: fileMetadata.bucket,
					path: fileMetadata.path,
				});
				// Metadata is already deleted, so we'll continue
			} else {
				console.log('Successfully deleted file from Supabase storage:', {
					bucket: fileMetadata.bucket,
					path: fileMetadata.path,
				});
			}
		}

		return true;
	} catch (error) {
		console.error('Error deleting file:', error);
		return false;
	}
}

/**
 * Get the appropriate bucket for a file category
 * This automatically links categories to their correct buckets
 */
export function getBucketForCategory(category: FileCategory): StorageBucket {
	const categoryToBucket: Record<FileCategory, StorageBucket> = {
		[FILE_CATEGORIES.PROFILE_PICTURE]: STORAGE_BUCKETS.PROFILE_PICTURES,
		[FILE_CATEGORIES.CONTRACT_FILE]: STORAGE_BUCKETS.CONTRACTS,
		[FILE_CATEGORIES.INVENTORY_IMAGE]: STORAGE_BUCKETS.INVENTORY,
		[FILE_CATEGORIES.EMPLOYEE_PICTURE]: STORAGE_BUCKETS.EMPLOYEES,
		[FILE_CATEGORIES.EMPLOYEE_DOCUMENT]: STORAGE_BUCKETS.EMPLOYEES,
		[FILE_CATEGORIES.BRANDING_LOGO]: STORAGE_BUCKETS.BRANDING,
		[FILE_CATEGORIES.BRANDING_STAMP]: STORAGE_BUCKETS.BRANDING,
		[FILE_CATEGORIES.PAYROLL_DOCUMENT]: STORAGE_BUCKETS.PAYROLL,
		[FILE_CATEGORIES.ASSET_FILE]: STORAGE_BUCKETS.ASSETS,
		[FILE_CATEGORIES.CUSTODY_DOCUMENT]: STORAGE_BUCKETS.CUSTODY,
	};

	return categoryToBucket[category] || STORAGE_BUCKETS.PROFILE_PICTURES; // Default fallback
}

/**
 * Get public access setting for a category
 * Note: BRANDING_LOGO is now private/secured by default
 */
export function getPublicAccessForCategory(category: FileCategory): boolean {
	const publicCategories: FileCategory[] = [
		FILE_CATEGORIES.PROFILE_PICTURE,
		FILE_CATEGORIES.INVENTORY_IMAGE,
		// BRANDING_LOGO removed - logos are now private/secured
	];

	return publicCategories.includes(category);
}

/**
 * Generate file path based on category and owner
 */
function generateFilePath(category: FileCategory, ownerId: string, fileName: string): string {
	const timestamp = Date.now();
	const sanitizedFileName = sanitizeFileName(fileName);
	const extension = getFileExtension(fileName);

	switch (category) {
		case 'profile_picture':
			return `profile-pictures/${ownerId}/profile-${timestamp}${extension}`;
		case 'contract_file':
			return `contracts/${ownerId}/contract-${timestamp}${extension}`;
		case 'inventory_image':
			return `inventory/${ownerId}/image-${timestamp}${extension}`;
		case 'employee_picture':
			return `employees/${ownerId}/picture-${timestamp}${extension}`;
		case 'employee_document':
			return `employees/${ownerId}/documents/${sanitizedFileName}`;
		case 'branding_logo':
			return `logos/${sanitizedFileName}`;
		case 'branding_stamp':
			return `stamps/${sanitizedFileName}`;
		case 'payroll_document':
			return `payroll/${ownerId}/document-${timestamp}${extension}`;
		case 'asset_file':
			return `assets/${ownerId}/file-${timestamp}${extension}`;
		case 'custody_document':
			return `custody/${ownerId}/document-${timestamp}${extension}`;
		default:
			return `misc/${ownerId}/${sanitizedFileName}`;
	}
}

/**
 * Sanitize file name for safe storage
 */
function sanitizeFileName(fileName: string): string {
	// Remove path separators and special characters
	return fileName
		.replace(/[^a-zA-Z0-9.-]/g, '_')
		.replace(/_{2,}/g, '_')
		.substring(0, 255); // Limit length
}

/**
 * Get file extension
 */
function getFileExtension(fileName: string): string {
	const lastDot = fileName.lastIndexOf('.');
	return lastDot > 0 ? fileName.substring(lastDot) : '';
}

/**
 * Get image dimensions
 */
function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		const url = URL.createObjectURL(file);

		img.onload = () => {
			URL.revokeObjectURL(url);
			resolve({
				width: img.width,
				height: img.height,
			});
		};

		img.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error('Failed to load image'));
		};

		img.src = url;
	});
}

/**
 * Validate file before upload
 */
export function validateFile(
	file: File,
	allowedTypes: string[],
	maxSizeBytes: number
): { valid: boolean; error?: string } {
	// Check file type
	if (!allowedTypes.includes(file.type)) {
		return {
			valid: false,
			error: `File type not allowed. Allowed types: ${allowedTypes.join(', ')}`,
		};
	}

	// Check file size
	if (file.size > maxSizeBytes) {
		const maxSizeMB = (maxSizeBytes / (1024 * 1024)).toFixed(2);
		return {
			valid: false,
			error: `File size exceeds maximum allowed size of ${maxSizeMB} MB`,
		};
	}

	return { valid: true };
}

