-- ============================================================================
-- Migration: Create sources table for unified file and URL ingestion
-- Description: Creates sources table to track both file uploads and URL sources
--              for course generation, with data migration from source_files
-- Date: 2025-01-09
-- ============================================================================

-- ============================================================================
-- PART 1: Create source_type enum and sources table (Subtask 3.1)
-- ============================================================================

-- Create source_type enum
create type public.source_type as enum ('file', 'link');

-- Create sources table
create table public.sources (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  type public.source_type not null,
  url text,
  content_type text,
  raw_text text,
  meta jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- Create indexes for performance
create index idx_sources_course_id on public.sources(course_id);
create index idx_sources_type on public.sources(type);
create index idx_sources_course_type on public.sources(course_id, type);

-- Enable RLS on sources table
alter table public.sources enable row level security;

-- ============================================================================
-- PART 2: Add RLS policies for sources table (Subtask 3.2)
-- ============================================================================

-- Users can view sources of their own courses OR admins can view all sources
create policy "Users can view own sources"
  on public.sources
  for select
  using (
    auth.uid() = (select user_id from public.courses where id = course_id)
    or public.is_admin()
  );

-- Anyone can view sources of published courses
create policy "Anyone can view published sources"
  on public.sources
  for select
  using (
    exists (
      select 1 from public.courses
      where id = course_id and published = true
    )
  );

-- Users can insert sources for their own courses OR admins can insert any source
create policy "Users can insert own sources"
  on public.sources
  for insert
  with check (
    auth.uid() = (select user_id from public.courses where id = course_id)
    or public.is_admin()
  );

-- Users can update sources of their own courses OR admins can update any source
create policy "Users can update own sources"
  on public.sources
  for update
  using (
    auth.uid() = (select user_id from public.courses where id = course_id)
    or public.is_admin()
  )
  with check (
    auth.uid() = (select user_id from public.courses where id = course_id)
    or public.is_admin()
  );

-- Users can delete sources of their own courses OR admins can delete any source
create policy "Users can delete own sources"
  on public.sources
  for delete
  using (
    auth.uid() = (select user_id from public.courses where id = course_id)
    or public.is_admin()
  );

-- ============================================================================
-- PART 3: Migrate existing source_files data to sources table (Subtask 3.4)
-- ============================================================================

-- Migrate existing source_files to sources table
-- Map: filename + storage_path -> meta, mime -> content_type, text_content -> raw_text
insert into public.sources (course_id, type, content_type, raw_text, meta, created_at)
select
  course_id,
  'file'::public.source_type,
  mime as content_type,
  text_content as raw_text,
  jsonb_build_object(
    'filename', filename,
    'storage_path', storage_path,
    'migrated_from_source_files', true
  ) as meta,
  created_at
from public.source_files;

-- ============================================================================
-- PART 4: Add columns to courses table for PRD-2 features
-- ============================================================================

-- Add author_tone column for tone of voice feature (PRD-2 requirement)
alter table public.courses
  add column if not exists author_tone text,
  add column if not exists last_validated_at timestamptz,
  add column if not exists last_validation_severity text check (last_validation_severity in ('ok', 'warning', 'error'));

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================

-- Comments for future reference:
-- 1. sources table now handles both file uploads (type='file') and URL ingestion (type='link')
-- 2. All existing source_files data has been migrated to sources table
-- 3. source_files table is kept for backward compatibility but should not be used going forward
-- 4. RLS policies follow the same pattern as other tables with admin access
-- 5. meta field stores additional information like filename, storage_path, and future URL metadata
-- 6. author_tone and validation fields added to courses table for PRD-2 features
