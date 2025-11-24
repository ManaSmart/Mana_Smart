/**
 * Logo Management Utility
 * Handles logo loading, URL regeneration, and fallback mechanisms
 */

import { getFileUrlFromS3, regenerateSignedUrlForS3, fileExistsInS3 } from './s3Storage';
import { getFilesByOwner, getFileUrl } from './storage';
import { FILE_CATEGORIES, STORAGE_BUCKETS } from '../../supabase/models/file_metadata';
import type { FileMetadata } from '../../supabase/models/file_metadata';

const LOGO_FIXED_PATH = 'branding/logo';
const LOCAL_LOGO_PATH = '/logo.png'; // Public folder path
const SIGNED_URL_EXPIRY = 604800; // 7 days in seconds

export interface LogoLoadResult {
	success: boolean;
	url: string | null;
	source: 's3_signed' | 'local_fallback' | 'error';
	fileMetadata?: FileMetadata;
	error?: string;
}

/**
 * Load logo with automatic fallback and URL regeneration
 */
export async function loadLogoWithFallback(
	brandingId: string
): Promise<LogoLoadResult> {
	try {
		// Step 1: Try to get logo from file metadata
		const brandingFiles = await getFilesByOwner(brandingId, 'branding', FILE_CATEGORIES.BRANDING_LOGO);
		const logoFile = brandingFiles.find(f => f.category === FILE_CATEGORIES.BRANDING_LOGO);

		if (logoFile && logoFile.bucket === STORAGE_BUCKETS.S3) {
			// Logo is in S3
			try {
				// Try to get signed URL
				const signedUrl = await getFileUrl(
					logoFile.bucket,
					logoFile.path,
					logoFile.is_public,
					SIGNED_URL_EXPIRY
				);

				if (signedUrl) {
					// Verify URL works by checking if we can fetch it
					const urlValid = await verifyUrlAccessible(signedUrl);
					if (urlValid) {
						return {
							success: true,
							url: signedUrl,
							source: 's3_signed',
							fileMetadata: logoFile,
						};
					} else {
						// URL expired or invalid, regenerate
						console.log('Signed URL expired or invalid, regenerating...');
						const newUrl = await regenerateSignedUrlForS3(logoFile.path, SIGNED_URL_EXPIRY);
						if (newUrl) {
							const newUrlValid = await verifyUrlAccessible(newUrl);
							if (newUrlValid) {
								return {
									success: true,
									url: newUrl,
									source: 's3_signed',
									fileMetadata: logoFile,
								};
							}
						}
					}
				}
			} catch (error) {
				console.error('Error loading logo from S3:', error);
			}
		}

		// Step 2: Fallback to local file
		const localUrl = LOCAL_LOGO_PATH;
		const localExists = await verifyUrlAccessible(localUrl);
		if (localExists) {
			console.log('Using local logo fallback');
			return {
				success: true,
				url: localUrl,
				source: 'local_fallback',
			};
		}

		// Step 3: All fallbacks failed
		return {
			success: false,
			url: null,
			source: 'error',
			error: 'Logo not found in S3 or local fallback',
		};
	} catch (error: any) {
		console.error('Error loading logo:', error);
		return {
			success: false,
			url: null,
			source: 'error',
			error: error.message || 'Unknown error',
		};
	}
}

/**
 * Verify if a URL is accessible (not expired, not CORS blocked)
 */
async function verifyUrlAccessible(url: string): Promise<boolean> {
	return new Promise((resolve) => {
		const img = new Image();
		let resolved = false;

		const timeout = setTimeout(() => {
			if (!resolved) {
				resolved = true;
				resolve(false);
			}
		}, 5000); // 5 second timeout

		img.onload = () => {
			if (!resolved) {
				resolved = true;
				clearTimeout(timeout);
				resolve(img.naturalWidth > 0 && img.naturalHeight > 0);
			}
		};

		img.onerror = () => {
			if (!resolved) {
				resolved = true;
				clearTimeout(timeout);
				resolve(false);
			}
		};

		// Set crossOrigin for CORS
		img.crossOrigin = 'anonymous';
		img.src = url;
	});
}

/**
 * Regenerate logo URL (call this when URL expires)
 */
export async function regenerateLogoUrl(
	brandingId: string
): Promise<string | null> {
	try {
		const brandingFiles = await getFilesByOwner(brandingId, 'branding', FILE_CATEGORIES.BRANDING_LOGO);
		const logoFile = brandingFiles.find(f => f.category === FILE_CATEGORIES.BRANDING_LOGO);

		if (logoFile && logoFile.bucket === STORAGE_BUCKETS.S3) {
			const newUrl = await regenerateSignedUrlForS3(logoFile.path, SIGNED_URL_EXPIRY);
			return newUrl;
		}

		return null;
	} catch (error) {
		console.error('Error regenerating logo URL:', error);
		return null;
	}
}

/**
 * Download logo from S3 to local public folder (backup)
 * Note: This runs in browser, so we can't directly write to /public
 * Instead, we'll store the blob in localStorage as a data URL
 */
export async function downloadLogoToLocalBackup(signedUrl: string): Promise<boolean> {
	try {
		// Fetch the image
		const response = await fetch(signedUrl, {
			mode: 'cors',
			credentials: 'omit',
		});

		if (!response.ok) {
			throw new Error(`Failed to fetch logo: ${response.status}`);
		}

		const blob = await response.blob();

		// Convert to data URL
		const reader = new FileReader();
		const dataUrl = await new Promise<string>((resolve, reject) => {
			reader.onloadend = () => resolve(reader.result as string);
			reader.onerror = reject;
			reader.readAsDataURL(blob);
		});

		// Store in localStorage as backup
		localStorage.setItem('logo_backup', dataUrl);
		localStorage.setItem('logo_backup_timestamp', Date.now().toString());

		console.log('✅ Logo backup saved to localStorage');
		return true;
	} catch (error) {
		console.error('Error downloading logo backup:', error);
		return false;
	}
}

/**
 * Get logo from local backup (localStorage)
 */
export function getLocalLogoBackup(): string | null {
	try {
		const backup = localStorage.getItem('logo_backup');
		if (backup) {
			const timestamp = parseInt(localStorage.getItem('logo_backup_timestamp') || '0', 10);
			const age = Date.now() - timestamp;
			const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days

			if (age < maxAge) {
				return backup;
			} else {
				// Backup is too old, remove it
				localStorage.removeItem('logo_backup');
				localStorage.removeItem('logo_backup_timestamp');
			}
		}
		return null;
	} catch (error) {
		console.error('Error getting local logo backup:', error);
		return null;
	}
}

/**
 * Clear logo from local backup (localStorage)
 * Call this when logo is deleted
 */
export function clearLocalLogoBackup(): void {
	try {
		localStorage.removeItem('logo_backup');
		localStorage.removeItem('logo_backup_timestamp');
		console.log('✅ Logo backup cleared from localStorage');
	} catch (error) {
		console.error('Error clearing local logo backup:', error);
	}
}

/**
 * Load logo with all fallbacks (S3 → Local Backup → Public Folder → Error)
 */
export async function loadLogoWithAllFallbacks(
	brandingId: string
): Promise<LogoLoadResult> {
	// Try S3 first
	const s3Result = await loadLogoWithFallback(brandingId);
	if (s3Result.success && s3Result.url) {
		// Download to local backup in background (don't wait)
		downloadLogoToLocalBackup(s3Result.url).catch(err => {
			console.warn('Failed to create local backup:', err);
		});
		return s3Result;
	}

	// Try local backup
	const localBackup = getLocalLogoBackup();
	if (localBackup) {
		const isValid = await verifyUrlAccessible(localBackup);
		if (isValid) {
			console.log('Using localStorage logo backup');
			return {
				success: true,
				url: localBackup,
				source: 'local_fallback',
			};
		}
	}

	// Try public folder
	const publicUrl = LOCAL_LOGO_PATH;
	const publicExists = await verifyUrlAccessible(publicUrl);
	if (publicExists) {
		return {
			success: true,
			url: publicUrl,
			source: 'local_fallback',
		};
	}

	// All fallbacks failed
	return {
		success: false,
		url: null,
		source: 'error',
		error: 'Logo not available from any source',
	};
}
