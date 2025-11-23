# File Storage System Setup Guide

This guide explains how to set up and use the structured file storage system in Supabase.

## Overview

The file storage system provides a secure, organized way to handle file uploads across different categories in your application. Each file is stored in Supabase Storage with metadata tracked in the `file_metadata` table.

## Categories and Buckets

### Profile Pictures
- **Bucket**: `profile-pictures`
- **Access Level**: Public (recommended)
- **Folder Structure**: `profile-pictures/{userId}/profile-{timestamp}.{ext}`
- **Allowed Types**: JPEG, PNG, WebP
- **Max Size**: 5 MB

### Signed Contract Files
- **Bucket**: `contracts`
- **Access Level**: Private
- **Folder Structure**: `contracts/{contractId}/contract-{timestamp}.pdf`
- **Allowed Types**: PDF
- **Max Size**: 10 MB

### Inventory Item Images
- **Bucket**: `inventory`
- **Access Level**: Public (recommended)
- **Folder Structure**: `inventory/{productCode}/image-{timestamp}.{ext}`
- **Allowed Types**: JPEG, PNG, WebP
- **Max Size**: 5 MB

### Employee Pictures
- **Bucket**: `employees`
- **Access Level**: Private
- **Folder Structure**: `employees/{employeeId}/picture-{timestamp}.{ext}`
- **Allowed Types**: JPEG, PNG, WebP
- **Max Size**: 5 MB

### Employee Documents
- **Bucket**: `employees`
- **Access Level**: Private
- **Folder Structure**: `employees/{employeeId}/documents/{filename}`
- **Allowed Types**: PDF, DOC, DOCX, JPEG, PNG
- **Max Size**: 10 MB

### Branding and Customization
- **Bucket**: `branding`
- **Access Level**: Public (for logos), Private (for stamps)
- **Folder Structure**: 
  - Logos: `branding/logos/{filename}`
  - Stamps: `branding/stamps/{filename}`
- **Allowed Types**: JPEG, PNG, WebP, SVG
- **Max Size**: 2 MB

### Payroll Documents
- **Bucket**: `payroll`
- **Access Level**: Private
- **Folder Structure**: `payroll/{employeeId}/document-{timestamp}.{ext}`
- **Allowed Types**: PDF, XLS, XLSX
- **Max Size**: 10 MB

### Fixed Asset Files
- **Bucket**: `assets`
- **Access Level**: Private
- **Folder Structure**: `assets/{assetId}/file-{timestamp}.{ext}`
- **Allowed Types**: PDF, JPEG, PNG, DOC, DOCX
- **Max Size**: 20 MB

### Employee Custody Documents
- **Bucket**: `custody`
- **Access Level**: Private
- **Folder Structure**: `custody/{employeeId}/document-{timestamp}.{ext}`
- **Allowed Types**: PDF, JPEG, PNG
- **Max Size**: 10 MB

## Setup Instructions

> **⚠️ Using AWS S3?** If you're using S3 for file storage instead of Supabase Storage, make sure to configure CORS on your S3 bucket. See [S3_CORS_SETUP.md](./S3_CORS_SETUP.md) for detailed instructions.

### 1. Create Supabase Storage Buckets

Run these SQL commands in your Supabase SQL Editor:

```sql
-- Create storage buckets
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('profile-pictures', 'profile-pictures', true),
  ('contracts', 'contracts', false),
  ('inventory', 'inventory', true),
  ('employees', 'employees', false),
  ('branding', 'branding', true),
  ('payroll', 'payroll', false),
  ('assets', 'assets', false),
  ('custody', 'custody', false)
ON CONFLICT (id) DO NOTHING;
```

### 2. Set Up Storage Policies

```sql
-- Profile Pictures: Public read, authenticated write
CREATE POLICY "Profile pictures are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'profile-pictures');

CREATE POLICY "Users can upload profile pictures"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'profile-pictures' AND auth.role() = 'authenticated');

CREATE POLICY "Users can update own profile pictures"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'profile-pictures' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own profile pictures"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'profile-pictures' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Contracts: Private, only owner can access
CREATE POLICY "Users can view contract files they own"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'contracts' AND auth.role() = 'authenticated');

CREATE POLICY "Users can upload contract files"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'contracts' AND auth.role() = 'authenticated');

CREATE POLICY "Users can delete contract files they own"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'contracts' AND auth.role() = 'authenticated');

-- Similar policies for other buckets...
```

### 3. Run Database Migration

Execute the SQL migration file:
```bash
# In Supabase Dashboard > SQL Editor, run:
supabase/migrations/001_create_file_metadata.sql
```

## Usage Examples

### Upload Profile Picture

```typescript
import { uploadFile } from '../lib/storage';
import { FILE_CATEGORIES, STORAGE_BUCKETS } from '../../supabase/models/file_metadata';

const result = await uploadFile({
  file: selectedFile,
  bucket: STORAGE_BUCKETS.PROFILE_PICTURES,
  category: FILE_CATEGORIES.PROFILE_PICTURE,
  ownerId: userId,
  ownerType: 'user',
  isPublic: true,
  userId: currentUserId,
});

if (result.success) {
  console.log('File uploaded:', result.fileMetadata);
  console.log('Public URL:', result.publicUrl);
}
```

### Get File URL

```typescript
import { getFileUrl } from '../lib/storage';

// For public files
const url = await getFileUrl('profile-pictures', 'path/to/file.jpg', true);

// For private files (signed URL, expires in 1 hour)
const signedUrl = await getFileUrl('contracts', 'path/to/contract.pdf', false, 3600);
```

### Delete File

```typescript
import { deleteFile } from '../lib/storage';

const success = await deleteFile(fileMetadataId);
```

### Get Files by Owner

```typescript
import { getFilesByOwner } from '../lib/storage';
import { FILE_CATEGORIES } from '../../supabase/models/file_metadata';

// Get all files for a user
const files = await getFilesByOwner(userId, 'user');

// Get only profile pictures
const profilePictures = await getFilesByOwner(
  userId,
  'user',
  FILE_CATEGORIES.PROFILE_PICTURE
);
```

## React Component Usage

### Profile Picture Upload Component

```tsx
import { ProfilePictureUpload } from './components/ProfilePictureUpload';

function UserProfile() {
  const [profilePictureUrl, setProfilePictureUrl] = useState<string | null>(null);
  const [fileId, setFileId] = useState<string | null>(null);

  return (
    <ProfilePictureUpload
      userId={currentUserId}
      currentPictureUrl={profilePictureUrl}
      currentFileId={fileId}
      onUploadComplete={(fileMetadata, url) => {
        setFileId(fileMetadata.id);
        setProfilePictureUrl(url);
      }}
      onDeleteComplete={() => {
        setFileId(null);
        setProfilePictureUrl(null);
      }}
      size="lg"
    />
  );
}
```

## Security Considerations

1. **Row Level Security (RLS)**: The `file_metadata` table has RLS enabled. Users can only access files they own or files marked as public.

2. **Storage Policies**: Each bucket has specific policies controlling who can read, write, and delete files.

3. **Signed URLs**: Private files use signed URLs that expire after a set time (default 1 hour).

4. **File Validation**: Always validate file types and sizes before upload.

5. **Soft Deletes**: Files are soft-deleted (marked with `deleted_at`) rather than permanently removed, allowing for recovery if needed.

## Testing Checklist

### Profile Picture Upload
- [ ] Can upload JPEG image
- [ ] Can upload PNG image
- [ ] Can upload WebP image
- [ ] Rejects files larger than 5MB
- [ ] Rejects non-image files
- [ ] Shows preview after upload
- [ ] Creates metadata record in database
- [ ] File appears in Supabase Storage
- [ ] Public URL is accessible
- [ ] Can delete uploaded picture
- [ ] Deletion removes file from storage
- [ ] Deletion marks metadata as deleted

### File Access
- [ ] Public files accessible without authentication
- [ ] Private files require signed URL
- [ ] Signed URLs expire after set time
- [ ] Users can only access their own files
- [ ] RLS policies prevent unauthorized access

### Error Handling
- [ ] Handles network errors gracefully
- [ ] Shows appropriate error messages
- [ ] Validates file before upload
- [ ] Handles duplicate file names
- [ ] Handles storage quota exceeded

## Next Steps

1. Create similar upload components for other file categories
2. Implement file preview components for different file types
3. Add file management UI for viewing and deleting files
4. Set up automated cleanup of deleted files (optional)
5. Implement file versioning if needed

