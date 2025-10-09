-- ============================================================================
-- Migration: Create course_validations table for validation results
-- Description: Creates course_validations table to store fast and deep
--              validation results with proper RLS policies
-- Date: 2025-01-09
-- ============================================================================

-- ============================================================================
-- PART 1: Create validation enums
-- ============================================================================

-- Create validation_type enum
create type public.validation_type as enum ('fast', 'deep');

-- Create validation_status enum
create type public.validation_status as enum ('pending', 'running', 'completed', 'failed');

-- Create validation_severity enum
create type public.validation_severity as enum ('info', 'warning', 'error');

-- ============================================================================
-- PART 2: Create course_validations table
-- ============================================================================

create table public.course_validations (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  validation_type public.validation_type not null,
  status public.validation_status not null default 'pending',
  results jsonb default '[]'::jsonb,
  severity public.validation_severity default 'info',
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now()
);

-- ============================================================================
-- PART 3: Create indexes for performance
-- ============================================================================

create index idx_course_validations_course_id on public.course_validations(course_id);
create index idx_course_validations_status on public.course_validations(status);
create index idx_course_validations_course_type on public.course_validations(course_id, validation_type);
create index idx_course_validations_created_at on public.course_validations(created_at desc);

-- ============================================================================
-- PART 4: Enable RLS and add policies
-- ============================================================================

-- Enable RLS on course_validations table
alter table public.course_validations enable row level security;

-- Users can view validations of their own courses OR admins can view all
create policy "Users can view own course validations"
  on public.course_validations
  for select
  using (
    auth.uid() = (select user_id from public.courses where id = course_id)
    or public.is_admin()
  );

-- Anyone can view validations of published courses
create policy "Anyone can view published course validations"
  on public.course_validations
  for select
  using (
    exists (
      select 1 from public.courses
      where id = course_id and published = true
    )
  );

-- Users can insert validations for their own courses OR admins can insert any
create policy "Users can insert own course validations"
  on public.course_validations
  for insert
  with check (
    auth.uid() = (select user_id from public.courses where id = course_id)
    or public.is_admin()
  );

-- Users can update validations of their own courses OR admins can update any
create policy "Users can update own course validations"
  on public.course_validations
  for update
  using (
    auth.uid() = (select user_id from public.courses where id = course_id)
    or public.is_admin()
  )
  with check (
    auth.uid() = (select user_id from public.courses where id = course_id)
    or public.is_admin()
  );

-- Users can delete validations of their own courses OR admins can delete any
create policy "Users can delete own course validations"
  on public.course_validations
  for delete
  using (
    auth.uid() = (select user_id from public.courses where id = course_id)
    or public.is_admin()
  );

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================

-- Comments for future reference:
-- 1. course_validations stores both fast and deep validation results
-- 2. results field is jsonb array containing individual validation findings
-- 3. severity indicates overall validation severity (info/warning/error)
-- 4. RLS policies follow existing pattern with admin access
-- 5. Indexes optimize common queries (by course, by status, by type)
