# How to Create Storage Buckets in Supabase

This guide explains how to create storage buckets in Supabase for the file storage system.

## Method 1: Using SQL (Recommended)

### Step 1: Open Supabase SQL Editor

1. Go to your Supabase Dashboard
2. Navigate to **SQL Editor** in the left sidebar
3. Click **New Query**

### Step 2: Run the Bucket Creation SQL

Copy and paste the SQL from `docs/STORAGE_BUCKETS_SETUP.sql` into the SQL Editor and click **Run**.

Alternatively, you can use the generated SQL from the utility:

```typescript
import { createBucketsSQL } from '../lib/storageBucketSetup';

// Generate SQL command
const sql = createBucketsSQL();
console.log(sql); // Copy this output to SQL Editor
```

### Step 3: Verify Buckets Were Created

Run this query to check:

```sql
SELECT id, name, public, file_size_limit, allowed_mime_types 
FROM storage.buckets 
ORDER BY id;
```

You should see all 8 buckets listed.

## Method 2: Using Supabase Dashboard

### Step 1: Navigate to Storage

1. Go to your Supabase Dashboard
2. Click **Storage** in the left sidebar
3. Click **New bucket**

### Step 2: Create Each Bucket

For each bucket, fill in the details:

#### Profile Pictures
- **Name**: `profile-pictures`
- **Public bucket**: ✅ Yes
- **File size limit**: 5 MB
- **Allowed MIME types**: `image/jpeg, image/jpg, image/png, image/webp`

#### Contracts
- **Name**: `contracts`
- **Public bucket**: ❌ No
- **File size limit**: 10 MB
- **Allowed MIME types**: `application/pdf`

#### Inventory
- **Name**: `inventory`
- **Public bucket**: ✅ Yes
- **File size limit**: 5 MB
- **Allowed MIME types**: `image/jpeg, image/jpg, image/png, image/webp`

#### Employees
- **Name**: `employees`
- **Public bucket**: ❌ No
- **File size limit**: 10 MB
- **Allowed MIME types**: `image/jpeg, image/jpg, image/png, image/webp, application/pdf, application/msword, application/vnd.openxmlformats-officedocument.wordprocessingml.document`

#### Branding
- **Name**: `branding`
- **Public bucket**: ✅ Yes
- **File size limit**: 2 MB
- **Allowed MIME types**: `image/jpeg, image/jpg, image/png, image/webp, image/svg+xml`

#### Payroll
- **Name**: `payroll`
- **Public bucket**: ❌ No
- **File size limit**: 10 MB
- **Allowed MIME types**: `application/pdf, application/vnd.ms-excel, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

#### Assets
- **Name**: `assets`
- **Public bucket**: ❌ No
- **File size limit**: 20 MB
- **Allowed MIME types**: `application/pdf, image/jpeg, image/jpg, image/png, application/msword, application/vnd.openxmlformats-officedocument.wordprocessingml.document`

#### Custody
- **Name**: `custody`
- **Public bucket**: ❌ No
- **File size limit**: 10 MB
- **Allowed MIME types**: `application/pdf, image/jpeg, image/jpg, image/png`

## Method 3: Using TypeScript Utility (Check Only)

The TypeScript utility can check if buckets exist but cannot create them directly (Supabase JS client limitation):

```typescript
import { checkBucketsExist } from '../lib/storageBucketSetup';

// Check if all buckets exist
const { allExist, missing, existing } = await checkBucketsExist();

if (!allExist) {
  console.log('Missing buckets:', missing);
  console.log('Existing buckets:', existing);
  // Use Method 1 or 2 to create missing buckets
}
```

## Automatic Bucket Linking

The storage system automatically links file categories to their correct buckets. You don't need to specify the bucket manually:

```typescript
import { uploadFile } from '../lib/storage';
import { FILE_CATEGORIES } from '../../supabase/models/file_metadata';

// Bucket is automatically determined from category
const result = await uploadFile({
  file: myFile,
  category: FILE_CATEGORIES.PROFILE_PICTURE, // Automatically uses 'profile-pictures' bucket
  ownerId: userId,
  ownerType: 'user',
  // bucket: 'profile-pictures', // Optional - not needed!
  // isPublic: true, // Optional - automatically determined from category
});
```

### Category to Bucket Mapping

| Category | Bucket | Public |
|----------|--------|--------|
| `profile_picture` | `profile-pictures` | ✅ Yes |
| `contract_file` | `contracts` | ❌ No |
| `inventory_image` | `inventory` | ✅ Yes |
| `employee_picture` | `employees` | ❌ No |
| `employee_document` | `employees` | ❌ No |
| `branding_logo` | `branding` | ✅ Yes |
| `branding_stamp` | `branding` | ❌ No |
| `payroll_document` | `payroll` | ❌ No |
| `asset_file` | `assets` | ❌ No |
| `custody_document` | `custody` | ❌ No |

## Setting Up Storage Policies

After creating buckets, you need to set up storage policies. Run the policies section from `docs/STORAGE_BUCKETS_SETUP.sql` or use the Supabase Dashboard:

1. Go to **Storage** > Select a bucket
2. Click **Policies** tab
3. Add policies for SELECT, INSERT, UPDATE, DELETE operations

## Verification Checklist

After creating buckets, verify:

- [ ] All 8 buckets are created
- [ ] Public buckets are set to public
- [ ] Private buckets are set to private
- [ ] File size limits are configured
- [ ] MIME type restrictions are set
- [ ] Storage policies are configured
- [ ] RLS policies on `file_metadata` table are active

## Troubleshooting

### Error: "Bucket not found"
- Make sure you've created the bucket using one of the methods above
- Check the bucket name matches exactly (case-sensitive)
- Verify you're using the correct bucket ID

### Error: "Permission denied"
- Check storage policies are set up correctly
- Verify RLS policies on `file_metadata` table
- Ensure user is authenticated

### Error: "File size exceeds limit"
- Check bucket file size limit configuration
- Verify file is within the allowed size
- Consider increasing limit if needed

## Next Steps

1. ✅ Create all buckets (Method 1 or 2)
2. ✅ Set up storage policies (from `STORAGE_BUCKETS_SETUP.sql`)
3. ✅ Run database migration (`001_create_file_metadata.sql`)
4. ✅ Test file upload using the storage utilities
5. ✅ Verify files appear in Supabase Storage dashboard

