# Storage Bucket Access Levels

This document explains the access levels (public/private) for each storage bucket in the system.

## Public Buckets (Anyone can view)

These buckets are publicly accessible, meaning files can be viewed without authentication:

### 1. **Profile Pictures** (`profile-pictures`)
- **Access**: Public read, authenticated upload
- **Purpose**: User profile pictures displayed in the app
- **Why Public**: Profile pictures are meant to be visible to other users in the system
- **File Types**: JPEG, PNG, WebP
- **Max Size**: 5 MB

### 2. **Inventory Images** (`inventory`)
- **Access**: Public read, authenticated upload
- **Purpose**: Product/item images for inventory management
- **Why Public**: Product images are typically displayed in catalogs and don't contain sensitive information
- **File Types**: JPEG, PNG, WebP
- **Max Size**: 5 MB

### 3. **Branding** (`branding`)
- **Access**: Public read, authenticated upload
- **Purpose**: Company logos and stamps used in documents
- **Why Public**: Branding assets are embedded in documents (invoices, quotes) that may be shared externally
- **File Types**: JPEG, PNG, WebP, SVG
- **Max Size**: 2 MB

---

## Private Buckets (Authenticated users only)

These buckets require authentication to access. Files are accessed via signed URLs for security:

### 4. **Contracts** (`contracts`)
- **Access**: Private (authenticated users only)
- **Purpose**: Signed contract PDFs
- **Why Private**: Contracts contain sensitive business and customer information
- **File Types**: PDF
- **Max Size**: 10 MB

### 5. **Employees** (`employees`)
- **Access**: Private (authenticated users only)
- **Purpose**: Employee pictures, documents (contracts, IDs, certificates, diplomas)
- **Why Private**: Contains sensitive personal information (PII)
- **File Types**: JPEG, PNG, WebP, PDF, DOC, DOCX
- **Max Size**: 10 MB

### 6. **Payroll** (`payroll`)
- **Access**: Private (authenticated users only)
- **Purpose**: Payroll documents and financial records
- **Why Private**: Highly sensitive financial data
- **File Types**: PDF, XLS, XLSX
- **Max Size**: 10 MB

### 7. **Assets** (`assets`)
- **Access**: Private (authenticated users only)
- **Purpose**: Fixed asset files and documentation
- **Why Private**: Company asset information is confidential
- **File Types**: PDF, JPEG, PNG, DOC, DOCX
- **Max Size**: 20 MB

### 8. **Custody** (`custody`)
- **Access**: Private (authenticated users only)
- **Purpose**: Employee custody documents (items assigned to employees)
- **Why Private**: Contains information about company property assigned to employees
- **File Types**: PDF, JPEG, PNG
- **Max Size**: 10 MB

---

## How Access Works

### Public Buckets
- Files can be accessed directly via public URLs
- No authentication required to view
- Still requires authentication to upload/update/delete

### Private Buckets
- Files require **signed URLs** for access
- Signed URLs are temporary (default: 1 hour expiry)
- Generated server-side or via Supabase Storage API
- Authentication required for all operations (read, write, delete)

---

## Security Notes

1. **RLS Policies**: All buckets have Row Level Security (RLS) policies that control access at the database level
2. **Storage Policies**: Additional policies on `storage.objects` control file-level access
3. **Signed URLs**: Private files use signed URLs that expire after a set time
4. **File Metadata**: The `file_metadata` table tracks ownership and access permissions

---

## Implementation

When using the storage system:

```typescript
import { uploadFile, getFileUrl, FILE_CATEGORIES } from '@/lib/storage';

// Upload to private bucket (payroll)
const result = await uploadFile({
  file: payrollFile,
  category: FILE_CATEGORIES.PAYROLL_DOCUMENT,
  ownerId: employeeId,
  ownerType: 'employee',
  userId: currentUserId,
});

// Get URL (will be signed URL for private files)
const url = await getFileUrl(
  result.fileMetadata.bucket,
  result.fileMetadata.path,
  result.fileMetadata.is_public // false for private files
);
```

The system automatically:
- Determines the correct bucket based on category
- Sets public/private access based on bucket configuration
- Generates signed URLs for private files
- Enforces RLS policies for security

