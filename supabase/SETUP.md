# Supabase Setup Guide

## Prerequisites

1. Create a Supabase project at https://supabase.com
2. Get your project URL and anon key from Project Settings > API

## Step 1: Configure Environment Variables

Update `.env.local` with your Supabase credentials:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

## Step 2: Enable Anonymous Authentication

1. Go to Authentication > Providers in your Supabase dashboard
2. Enable "Anonymous Sign-ins"
3. Save the changes

## Step 3: Run Database Migration

### Option 1: Using Supabase Dashboard (Recommended for first-time setup)

1. Go to SQL Editor in your Supabase dashboard
2. Create a new query
3. Copy the entire contents of `supabase/migrations/20250104000000_initial_schema.sql`
4. Paste and run the query
5. Verify tables are created in Table Editor

### Option 2: Using Supabase CLI

```bash
# Install Supabase CLI if not already installed
npm install -g supabase

# Login to Supabase
supabase login

# Link your project (get project ref from dashboard URL)
supabase link --project-ref your-project-ref

# Run migrations
supabase db push
```

## Step 4: Create Storage Buckets

### Bucket 1: course-uploads (for source documents)

1. Go to Storage in your Supabase dashboard
2. Click "New bucket"
3. Name: `course-uploads`
4. Public bucket: **No** (private)
5. File size limit: 50 MB (adjust as needed)
6. Allowed MIME types: Leave empty or specify:
   - `application/pdf`
   - `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
   - `text/markdown`
   - `text/plain`
   - `text/rtf`
   - `text/html`

**Bucket Policy (SQL):**

Go to Storage > course-uploads > Policies and add:

```sql
-- Allow authenticated users to upload files to their own folder
create policy "Users can upload to own folder"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'course-uploads' and
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to view their own files
create policy "Users can view own files"
on storage.objects for select
to authenticated
using (
  bucket_id = 'course-uploads' and
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to delete their own files
create policy "Users can delete own files"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'course-uploads' and
  (storage.foldername(name))[1] = auth.uid()::text
);
```

### Bucket 2: course-assets (for images and generated content)

1. Go to Storage in your Supabase dashboard
2. Click "New bucket"
3. Name: `course-assets`
4. Public bucket: **Yes** (for published course assets)
5. File size limit: 10 MB
6. Allowed MIME types:
   - `image/png`
   - `image/jpeg`
   - `image/webp`
   - `image/gif`

**Bucket Policy (SQL):**

```sql
-- Allow authenticated users to upload assets to their own courses
create policy "Users can upload course assets"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'course-assets' and
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow anyone to view published course assets (public bucket)
create policy "Anyone can view course assets"
on storage.objects for select
to public
using (bucket_id = 'course-assets');

-- Allow users to delete their own assets
create policy "Users can delete own assets"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'course-assets' and
  (storage.foldername(name))[1] = auth.uid()::text
);
```

## Step 5: Verify Setup

Test the setup by running:

```typescript
import { supabase } from '@/lib/supabaseClient'

// Test connection
const { data, error } = await supabase
  .from('courses')
  .select('count')

console.log('Connection test:', { data, error })
```

## Storage File Path Convention

When uploading files, use this path structure:

- **course-uploads**: `{user_id}/{course_id}/{filename}`
- **course-assets**: `{user_id}/{course_id}/{asset_id}.{ext}`

Example:
```typescript
const filePath = `${userId}/${courseId}/${file.name}`
const { data, error } = await supabase.storage
  .from('course-uploads')
  .upload(filePath, file)
```

## Troubleshooting

### Migration fails with "permission denied"
- Make sure you're using the service role key in the CLI, not the anon key
- Or run migrations directly in SQL Editor with dashboard access

### Anonymous auth not working
- Verify anonymous sign-ins are enabled in Authentication > Providers
- Check that RLS policies allow access via `auth.uid()`

### Storage upload fails
- Verify bucket exists and policies are created
- Check file path starts with user ID
- Ensure MIME type is allowed in bucket settings

### RLS blocking queries
- Anonymous users have a valid `auth.uid()` - RLS should work
- Use `auth.uid() = user_id` pattern in policies
- Test with SQL Editor to debug policy logic

## Next Steps

After setup is complete:

1. Update Task Master: `npm run task-master set-status --id=1.1 --status=done`
2. Test anonymous authentication in your app
3. Test file uploads to both buckets
4. Verify RLS is working by trying to access another user's data
