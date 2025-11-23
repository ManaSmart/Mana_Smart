import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { FileMetadata, FileMetadataInsert, FileCategory, StorageBucket } from '../../supabase/models/file_metadata';
import { STORAGE_BUCKETS } from '../../supabase/models/file_metadata';
import { supabase } from './supabaseClient';

// AWS S3 Configuration
const AWS_REGION = import.meta.env.VITE_AWS_REGION || 'us-east-1';
const AWS_S3_BUCKET = import.meta.env.VITE_AWS_S3_BUCKET || '';
const AWS_ACCESS_KEY_ID = import.meta.env.VITE_AWS_ACCESS_KEY_ID || '';
const AWS_SECRET_ACCESS_KEY = import.meta.env.VITE_AWS_SECRET_ACCESS_KEY || '';

// Initialize S3 Client
const s3Client = new S3Client({
	region: AWS_REGION,
	credentials: {
		accessKeyId: AWS_ACCESS_KEY_ID,
		secretAccessKey: AWS_SECRET_ACCESS_KEY,
	},
});

export interface UploadFileOptions {
	file: File;
	category: FileCategory;
	ownerId: string;
	ownerType: string;
	bucket?: StorageBucket; // Kept for compatibility, but S3 uses single bucket
	path?: string;
	description?: string;
	isPublic?: boolean;
	metadata?: Record<string, any>;
	userId?: string;
}

export interface UploadFileResult {
	success: boolean;
	fileMetadata?: FileMetadata;
	error?: string;
	publicUrl?: string;
	signedUrl?: string;
}

/**
 * Upload file to AWS S3 and create metadata record in Supabase
 */
export async function uploadFileToS3(options: UploadFileOptions): Promise<UploadFileResult> {
	try {
		const {
			file,
			category,
			ownerId,
			ownerType,
			path: customPath,
			description,
			isPublic,
			metadata,
			userId,
		} = options;

		// Validate AWS configuration
		if (!AWS_S3_BUCKET || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
			return {
				success: false,
				error: 'AWS S3 configuration is missing. Please check your environment variables.',
			};
		}

		// Generate file path if not provided
		const filePath = customPath || generateFilePath(category, ownerId, file.name);

		// Get image dimensions if it's an image
		let width: number | null = null;
		let height: number | null = null;

		if (file.type.startsWith('image/')) {
			const dimensions = await getImageDimensions(file);
			width = dimensions.width;
			height = dimensions.height;
		}

		// Convert File to ArrayBuffer for browser compatibility
		// This fixes the "readableStream.getReader is not a function" error
		// The AWS SDK v3 in browsers sometimes has issues with File objects directly,
		// so we convert to Uint8Array which is universally supported
		const fileBuffer = await file.arrayBuffer();

		// Upload file to S3
		// Note: ACLs are disabled on this bucket, so public access must be handled via bucket policy
		// For public files, ensure your bucket policy allows public read access
		const uploadCommand = new PutObjectCommand({
			Bucket: AWS_S3_BUCKET,
			Key: filePath,
			Body: new Uint8Array(fileBuffer), // Convert ArrayBuffer to Uint8Array for S3
			ContentType: file.type,
			Metadata: {
				originalName: file.name,
				category,
				ownerId,
				ownerType,
				...(metadata || {}),
			},
			// ACL parameter removed - bucket has ACLs disabled
			// Public access must be configured via bucket policy instead
		});

		await s3Client.send(uploadCommand);

		// Get S3 URL - use virtual-hosted-style URL format
		// For S3, paths should be URL-encoded but forward slashes should remain
		let encodedPath = filePath;
		// Only encode if path contains special characters (not already encoded)
		if (filePath.includes('%') === false) {
			// Split by /, encode each segment, then rejoin
			const pathSegments = filePath.split('/');
			const encodedSegments = pathSegments.map(segment => {
				// Only encode if segment has special characters
				if (segment && /[^a-zA-Z0-9._-]/.test(segment)) {
					return encodeURIComponent(segment);
				}
				return segment;
			});
			encodedPath = encodedSegments.join('/');
		}
		const s3Url = `https://${AWS_S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${encodedPath}`;
		console.log('S3 Upload URL generated:', {
			originalPath: filePath,
			encodedPath,
			fullUrl: s3Url
		});

		// Create file metadata record in Supabase
		const fileMetadata: FileMetadataInsert = {
			owner_id: ownerId,
			owner_type: ownerType,
			category,
			bucket: STORAGE_BUCKETS.S3, // Mark as S3 storage
			path: filePath,
			file_name: file.name,
			mime_type: file.type,
			size: file.size,
			width,
			height,
			description: description || null,
			is_public: isPublic || false,
			metadata: metadata || null,
			created_by: userId || null,
			deleted_at: null,
		};

		const { data: metadataData, error: metadataError } = await supabase
			.from('file_metadata')
			.insert(fileMetadata)
			.select()
			.single();

		if (metadataError) {
			// If metadata insert fails, try to delete the uploaded file from S3
			try {
				await deleteFileFromS3(filePath);
			} catch (cleanupError) {
				console.error('Failed to cleanup uploaded file from S3:', cleanupError);
			}

			return {
				success: false,
				error: `Failed to create metadata: ${metadataError.message}`,
			};
		}

		// Get public URL or signed URL
		let publicUrl: string | undefined;
		let signedUrl: string | undefined;

		if (isPublic) {
			publicUrl = s3Url;
		} else {
			// Generate presigned URL (valid for 1 hour)
			signedUrl = await getSignedUrlForS3(filePath, 3600);
		}

		return {
			success: true,
			fileMetadata: metadataData,
			publicUrl,
			signedUrl,
		};
	} catch (error: any) {
		console.error('Error uploading file to S3:', error);
		return {
			success: false,
			error: error.message || 'Unknown error occurred',
		};
	}
}


/**
 * Get file URL from S3 (public or signed)
 * Since bucket returns 403 for public access, we'll use presigned URLs
 * For branding logos that need to persist, use longer expiration (7 days)
 */
export async function getFileUrlFromS3(
	path: string,
	isPublic: boolean,
	expiresIn: number = 3600
): Promise<string | null> {
	try {
		// Check if this is a branding logo - use longer expiration (7 days = 604800 seconds)
		// Check for both old S3 path format (branding/logos) and new Supabase format (logos)
		const isBrandingLogo = path.includes('branding/logos') || path.startsWith('logos/');
		const expirationTime = isBrandingLogo ? 604800 : expiresIn; // 7 days for logos, default for others
		
		// Since we're getting 403 errors for public URLs, always use presigned URLs
		// This works even if bucket doesn't have public access configured
		if (isPublic) {
			console.log('S3 bucket appears to require authentication, using presigned URL instead of public URL');
			console.log('To use public URLs, configure S3 bucket for public read access');
		}
		console.log('Generated presigned URL (expires in', expirationTime, 'seconds)');
		console.warn('⚠️ If you see CORS errors, configure CORS on your S3 bucket. See docs/S3_CORS_SETUP.md for instructions.');
		
		// Use presigned URL (works for both public and private files)
		return await getSignedUrlForS3(path, expirationTime);
	} catch (error) {
		console.error('Error getting file URL from S3:', error);
		return null;
	}
}

/**
 * Delete file from S3
 */
export async function deleteFileFromS3(path: string): Promise<boolean> {
	try {
		const deleteCommand = new DeleteObjectCommand({
			Bucket: AWS_S3_BUCKET,
			Key: path,
		});

		await s3Client.send(deleteCommand);
		return true;
	} catch (error) {
		console.error('Error deleting file from S3:', error);
		return false;
	}
}

/**
 * Check if file exists in S3
 */
export async function fileExistsInS3(path: string): Promise<boolean> {
	try {
		const headCommand = new HeadObjectCommand({
			Bucket: AWS_S3_BUCKET,
			Key: path,
		});

		await s3Client.send(headCommand);
		return true;
	} catch (error: any) {
		if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
			return false;
		}
		throw error;
	}
}

/**
 * Generate presigned URL for private files
 */
async function getSignedUrlForS3(path: string, expiresIn: number): Promise<string> {
	const command = new GetObjectCommand({
		Bucket: AWS_S3_BUCKET,
		Key: path,
	});

	return await getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Generate file path based on category and owner
 */
function generateFilePath(category: FileCategory, ownerId: string, fileName: string): string {
	const timestamp = Date.now();
	const sanitizedFileName = sanitizeFileName(fileName);
	const extension = getFileExtension(fileName);

	// Use same path structure as Supabase for consistency
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
			return `branding/logos/${sanitizedFileName}`;
		case 'branding_stamp':
			return `branding/stamps/${sanitizedFileName}`;
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
	return fileName
		.replace(/[^a-zA-Z0-9.-]/g, '_')
		.replace(/_{2,}/g, '_')
		.substring(0, 255);
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

