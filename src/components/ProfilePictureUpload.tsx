import { useState, useRef } from 'react';
import { Upload, X, User, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { toast } from 'sonner';
import { uploadFile, deleteFile, getFileUrl, validateFile } from '../lib/storage';
import { FILE_CATEGORIES } from '../../supabase/models/file_metadata';
import type { FileMetadata } from '../../supabase/models/file_metadata';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { supabase } from '../lib/supabaseClient';

interface ProfilePictureUploadProps {
	userId: string;
	currentPictureUrl?: string | null;
	currentFileId?: string | null;
	onUploadComplete?: (fileMetadata: FileMetadata, url: string) => void;
	onDeleteComplete?: () => void;
	size?: 'sm' | 'md' | 'lg';
	className?: string;
}

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

export function ProfilePictureUpload({
	userId,
	currentPictureUrl,
	currentFileId,
	onUploadComplete,
	onDeleteComplete,
	size = 'md',
	className = '',
}: ProfilePictureUploadProps) {
	const [uploading, setUploading] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [previewUrl, setPreviewUrl] = useState<string | null>(currentPictureUrl || null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const sizeClasses = {
		sm: 'w-16 h-16',
		md: 'w-24 h-24',
		lg: 'w-32 h-32',
	};

	const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (!file) return;

		// Validate file
		const validation = validateFile(file, ALLOWED_IMAGE_TYPES, MAX_FILE_SIZE);
		if (!validation.valid) {
			toast.error(validation.error);
			return;
		}

		// Show preview
		const reader = new FileReader();
		reader.onloadend = () => {
			setPreviewUrl(reader.result as string);
		};
		reader.readAsDataURL(file);

		// Upload file
		await handleUpload(file);
	};

	const handleUpload = async (file: File) => {
		setUploading(true);

		try {
			// Get current user ID from auth
			const { data: { user } } = await supabase.auth.getUser();
			const uploaderUserId = user?.id || userId;

			// Delete old picture if exists
			if (currentFileId) {
				await deleteFile(currentFileId);
			}

			// Upload new picture
			// Bucket and isPublic are automatically determined from category
			const result = await uploadFile({
				file,
				category: FILE_CATEGORIES.PROFILE_PICTURE, // Automatically uses 'profile-pictures' bucket
				ownerId: userId,
				ownerType: 'user',
				// bucket: STORAGE_BUCKETS.PROFILE_PICTURES, // Optional - auto-determined
				// isPublic: true, // Optional - auto-determined from category
				userId: uploaderUserId,
			});

			if (!result.success || !result.fileMetadata) {
				throw new Error(result.error || 'Failed to upload file');
			}

			// Get public URL
			const url = result.publicUrl || (await getFileUrl(
				result.fileMetadata.bucket as any, // Use bucket from metadata
				result.fileMetadata.path,
				result.fileMetadata.is_public
			));

			if (!url) {
				throw new Error('Failed to get file URL');
			}

			setPreviewUrl(url);
			toast.success('Profile picture uploaded successfully');

			if (onUploadComplete) {
				onUploadComplete(result.fileMetadata, url);
			}
		} catch (error: any) {
			console.error('Error uploading profile picture:', error);
			toast.error(error.message || 'Failed to upload profile picture');
			// Reset preview on error
			setPreviewUrl(currentPictureUrl || null);
		} finally {
			setUploading(false);
			// Reset file input
			if (fileInputRef.current) {
				fileInputRef.current.value = '';
			}
		}
	};

	const handleDelete = async () => {
		if (!currentFileId) return;

		setDeleting(true);

		try {
			const success = await deleteFile(currentFileId);
			if (success) {
				setPreviewUrl(null);
				toast.success('Profile picture deleted successfully');
				if (onDeleteComplete) {
					onDeleteComplete();
				}
			} else {
				throw new Error('Failed to delete file');
			}
		} catch (error: any) {
			console.error('Error deleting profile picture:', error);
			toast.error(error.message || 'Failed to delete profile picture');
		} finally {
			setDeleting(false);
		}
	};

	return (
		<div className={`flex flex-col items-center gap-4 ${className}`}>
			<div className={`relative ${sizeClasses[size]} rounded-full overflow-hidden border-2 border-gray-200 bg-gray-100`}>
				{previewUrl ? (
					<ImageWithFallback
						src={previewUrl}
						alt="Profile picture"
						className="w-full h-full object-cover"
					/>
				) : (
					<div className="w-full h-full flex items-center justify-center">
						<User className="w-1/2 h-1/2 text-gray-400" />
					</div>
				)}

				{uploading && (
					<div className="absolute inset-0 bg-black/50 flex items-center justify-center">
						<Loader2 className="w-6 h-6 text-white animate-spin" />
					</div>
				)}
			</div>

			<div className="flex gap-2">
				<input
					ref={fileInputRef}
					type="file"
					accept={ALLOWED_IMAGE_TYPES.join(',')}
					onChange={handleFileSelect}
					className="hidden"
					disabled={uploading || deleting}
				/>

				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={() => fileInputRef.current?.click()}
					disabled={uploading || deleting}
					className="gap-2"
				>
					{uploading ? (
						<>
							<Loader2 className="w-4 h-4 animate-spin" />
							Uploading...
						</>
					) : (
						<>
							<Upload className="w-4 h-4" />
							{previewUrl ? 'Change' : 'Upload'}
						</>
					)}
				</Button>

				{previewUrl && currentFileId && (
					<Button
						type="button"
						variant="destructive"
						size="sm"
						onClick={handleDelete}
						disabled={uploading || deleting}
						className="gap-2"
					>
						{deleting ? (
							<>
								<Loader2 className="w-4 h-4 animate-spin" />
								Deleting...
							</>
						) : (
							<>
								<X className="w-4 h-4" />
								Delete
							</>
						)}
					</Button>
				)}
			</div>

			<p className="text-xs text-muted-foreground text-center max-w-xs">
				Allowed: JPEG, PNG, WebP (max 5MB)
			</p>
		</div>
	);
}

