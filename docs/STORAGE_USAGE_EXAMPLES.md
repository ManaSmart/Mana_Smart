# File Storage Usage Examples

This guide shows how to use the file storage system with automatic bucket linking.

## Key Features

✅ **Automatic Bucket Selection** - Bucket is automatically determined from file category  
✅ **Automatic Public/Private Setting** - Access level is automatically set based on category  
✅ **Automatic Path Generation** - File paths are automatically generated based on category and owner  
✅ **Type Safety** - Full TypeScript support with type-safe categories and buckets

## Basic Usage

### Upload a Profile Picture

```typescript
import { uploadFile } from '../lib/storage';
import { FILE_CATEGORIES } from '../../supabase/models/file_metadata';

const result = await uploadFile({
  file: selectedFile,
  category: FILE_CATEGORIES.PROFILE_PICTURE, // Automatically uses 'profile-pictures' bucket
  ownerId: userId,
  ownerType: 'user',
  userId: currentUserId,
});

// Bucket and isPublic are automatically determined!
// - Bucket: 'profile-pictures'
// - isPublic: true
// - Path: 'profile-pictures/{userId}/profile-{timestamp}.jpg'
```

### Upload a Contract File

```typescript
const result = await uploadFile({
  file: contractPdf,
  category: FILE_CATEGORIES.CONTRACT_FILE, // Automatically uses 'contracts' bucket
  ownerId: contractId,
  ownerType: 'contract',
  description: 'Signed service contract',
  userId: currentUserId,
});

// Automatically:
// - Bucket: 'contracts'
// - isPublic: false (private)
// - Path: 'contracts/{contractId}/contract-{timestamp}.pdf'
```

### Upload an Inventory Image

```typescript
const result = await uploadFile({
  file: productImage,
  category: FILE_CATEGORIES.INVENTORY_IMAGE, // Automatically uses 'inventory' bucket
  ownerId: productCode,
  ownerType: 'inventory',
  userId: currentUserId,
});

// Automatically:
// - Bucket: 'inventory'
// - isPublic: true
// - Path: 'inventory/{productCode}/image-{timestamp}.jpg'
```

## Advanced Usage

### Override Automatic Settings

You can still override bucket or public setting if needed:

```typescript
const result = await uploadFile({
  file: myFile,
  category: FILE_CATEGORIES.PROFILE_PICTURE,
  ownerId: userId,
  ownerType: 'user',
  bucket: 'custom-bucket', // Override automatic bucket selection
  isPublic: false, // Override automatic public setting
  path: 'custom/path/file.jpg', // Override automatic path generation
  userId: currentUserId,
});
```

### Custom Metadata

```typescript
const result = await uploadFile({
  file: employeeDocument,
  category: FILE_CATEGORIES.EMPLOYEE_DOCUMENT,
  ownerId: employeeId,
  ownerType: 'employee',
  description: 'Employment contract',
  metadata: {
    documentType: 'contract',
    expiryDate: '2025-12-31',
    department: 'Sales',
  },
  userId: currentUserId,
});
```

## Retrieving Files

### Get File URL

```typescript
import { getFileUrl } from '../lib/storage';

// For public files
const publicUrl = await getFileUrl(
  'profile-pictures',
  'profile-pictures/user-123/profile-1234567890.jpg',
  true
);

// For private files (signed URL, expires in 1 hour)
const signedUrl = await getFileUrl(
  'contracts',
  'contracts/contract-123/contract-1234567890.pdf',
  false,
  3600 // expires in 1 hour
);
```

### Get File Metadata

```typescript
import { getFileMetadata } from '../lib/storage';

const metadata = await getFileMetadata(fileId);
if (metadata) {
  // Use metadata.bucket to get the correct bucket
  const url = await getFileUrl(
    metadata.bucket,
    metadata.path,
    metadata.is_public
  );
}
```

### Get Files by Owner

```typescript
import { getFilesByOwner } from '../lib/storage';
import { FILE_CATEGORIES } from '../../supabase/models/file_metadata';

// Get all files for a user
const allFiles = await getFilesByOwner(userId, 'user');

// Get only profile pictures
const profilePictures = await getFilesByOwner(
  userId,
  'user',
  FILE_CATEGORIES.PROFILE_PICTURE
);
```

## Category to Bucket Mapping

The system automatically maps categories to buckets:

| Category | Bucket | Public | Path Pattern |
|----------|--------|--------|--------------|
| `profile_picture` | `profile-pictures` | ✅ | `profile-pictures/{userId}/profile-{timestamp}.{ext}` |
| `contract_file` | `contracts` | ❌ | `contracts/{contractId}/contract-{timestamp}.pdf` |
| `inventory_image` | `inventory` | ✅ | `inventory/{productCode}/image-{timestamp}.{ext}` |
| `employee_picture` | `employees` | ❌ | `employees/{employeeId}/picture-{timestamp}.{ext}` |
| `employee_document` | `employees` | ❌ | `employees/{employeeId}/documents/{filename}` |
| `branding_logo` | `branding` | ✅ | `branding/logos/{filename}` |
| `branding_stamp` | `branding` | ❌ | `branding/stamps/{filename}` |
| `payroll_document` | `payroll` | ❌ | `payroll/{employeeId}/document-{timestamp}.{ext}` |
| `asset_file` | `assets` | ❌ | `assets/{assetId}/file-{timestamp}.{ext}` |
| `custody_document` | `custody` | ❌ | `custody/{employeeId}/document-{timestamp}.{ext}` |

## React Component Example

```tsx
import { useState } from 'react';
import { uploadFile } from '../lib/storage';
import { FILE_CATEGORIES } from '../../supabase/models/file_metadata';
import { Button } from './ui/button';
import { toast } from 'sonner';

function FileUploader() {
  const [uploading, setUploading] = useState(false);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const result = await uploadFile({
        file,
        category: FILE_CATEGORIES.PROFILE_PICTURE, // Just specify category!
        ownerId: userId,
        ownerType: 'user',
        userId: currentUserId,
      });

      if (result.success && result.fileMetadata) {
        toast.success('File uploaded successfully!');
        console.log('File URL:', result.publicUrl || result.signedUrl);
        console.log('Metadata:', result.fileMetadata);
      } else {
        toast.error(result.error || 'Upload failed');
      }
    } catch (error) {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <input
        type="file"
        onChange={handleFileUpload}
        disabled={uploading}
      />
      {uploading && <p>Uploading...</p>}
    </div>
  );
}
```

## Benefits of Automatic Bucket Linking

1. **Less Code** - No need to specify bucket manually
2. **Type Safety** - TypeScript ensures correct category usage
3. **Consistency** - Same category always uses same bucket
4. **Maintainability** - Change bucket mapping in one place
5. **Error Prevention** - Can't accidentally use wrong bucket

## Manual Bucket Selection (When Needed)

If you need to use a different bucket for a specific case:

```typescript
import { STORAGE_BUCKETS } from '../../supabase/models/file_metadata';

const result = await uploadFile({
  file: myFile,
  category: FILE_CATEGORIES.PROFILE_PICTURE,
  bucket: STORAGE_BUCKETS.INVENTORY, // Override to use inventory bucket
  ownerId: userId,
  ownerType: 'user',
  userId: currentUserId,
});
```

## Best Practices

1. ✅ Always use category constants (`FILE_CATEGORIES.PROFILE_PICTURE`)
2. ✅ Let the system determine bucket automatically
3. ✅ Only override bucket/isPublic when absolutely necessary
4. ✅ Store file metadata ID for future reference
5. ✅ Use `getFileUrl()` with metadata.bucket for retrieval
6. ✅ Handle errors gracefully
7. ✅ Validate files before upload

