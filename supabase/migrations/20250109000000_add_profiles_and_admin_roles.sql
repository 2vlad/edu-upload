-- ============================================================================
-- Migration: Add profiles table with roles and admin access
-- Description: Creates profiles table, helper functions, and updates RLS
--              policies to support admin role access to all courses
-- Date: 2025-01-09
-- ============================================================================

-- ============================================================================
-- PART 1: Create profiles table with user roles (Subtask 1.1)
-- ============================================================================

-- Create user_role enum type
create type public.user_role as enum ('user', 'admin');

-- Create profiles table
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  role public.user_role not null default 'user',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Create indexes for performance
create index idx_profiles_user_id on public.profiles(user_id);
create index idx_profiles_role on public.profiles(role);
create index idx_profiles_user_role on public.profiles(user_id, role);

-- Add trigger for updated_at
create trigger update_profiles_updated_at
  before update on public.profiles
  for each row
  execute function public.update_updated_at_column();

-- Enable RLS on profiles table
alter table public.profiles enable row level security;

-- RLS Policies for profiles table
-- Users can view their own profile
create policy "Users can view own profile"
  on public.profiles
  for select
  using (auth.uid() = user_id);

-- Admins can view all profiles
create policy "Admins can view all profiles"
  on public.profiles
  for select
  using (
    exists (
      select 1 from public.profiles
      where user_id = auth.uid() and role = 'admin'
    )
  );

-- Users can insert their own profile
create policy "Users can insert own profile"
  on public.profiles
  for insert
  with check (auth.uid() = user_id);

-- Users can update their own profile (but not role)
create policy "Users can update own profile"
  on public.profiles
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and role = (select role from public.profiles where user_id = auth.uid()));

-- Only admins can update roles
create policy "Admins can update any profile"
  on public.profiles
  for update
  using (
    exists (
      select 1 from public.profiles
      where user_id = auth.uid() and role = 'admin'
    )
  );

-- Function to automatically create profile on user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (user_id, role)
  values (new.id, 'user');
  return new;
end;
$$ language plpgsql security definer;

-- Trigger to create profile automatically
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ============================================================================
-- PART 2: Create helper functions for role checking (Subtask 1.5)
-- ============================================================================

-- Function to check if a user is an admin
create or replace function public.is_admin(user_uuid uuid)
returns boolean as $$
begin
  return exists (
    select 1 from public.profiles
    where user_id = user_uuid and role = 'admin'
  );
end;
$$ language plpgsql security definer stable;

-- Overloaded function to check if current user is admin
create or replace function public.is_admin()
returns boolean as $$
begin
  return public.is_admin(auth.uid());
end;
$$ language plpgsql security definer stable;

-- Function to get user role
create or replace function public.get_user_role(user_uuid uuid)
returns public.user_role as $$
begin
  return (
    select role from public.profiles
    where user_id = user_uuid
  );
end;
$$ language plpgsql security definer stable;

-- Overloaded function to get current user's role
create or replace function public.get_user_role()
returns public.user_role as $$
begin
  return public.get_user_role(auth.uid());
end;
$$ language plpgsql security definer stable;

-- ============================================================================
-- PART 3: Update courses table RLS policies for admin access (Subtask 1.2)
-- ============================================================================

-- Drop existing policies that need to be updated
drop policy if exists "Users can view own courses" on public.courses;
drop policy if exists "Users can update own courses" on public.courses;
drop policy if exists "Users can delete own courses" on public.courses;

-- Recreate policies with admin access
-- Users can view their own courses OR admins can view all courses
create policy "Users can view own courses"
  on public.courses
  for select
  using (
    auth.uid() = user_id
    or public.is_admin()
  );

-- Users can update their own courses OR admins can update all courses
create policy "Users can update own courses"
  on public.courses
  for update
  using (
    auth.uid() = user_id
    or public.is_admin()
  )
  with check (
    auth.uid() = user_id
    or public.is_admin()
  );

-- Users can delete their own courses OR admins can delete all courses
create policy "Users can delete own courses"
  on public.courses
  for delete
  using (
    auth.uid() = user_id
    or public.is_admin()
  );

-- ============================================================================
-- PART 4: Update lessons table RLS policies for admin access (Subtask 1.3)
-- ============================================================================

-- Drop existing policies that need to be updated
drop policy if exists "Users can view own lessons" on public.lessons;
drop policy if exists "Users can insert own lessons" on public.lessons;
drop policy if exists "Users can update own lessons" on public.lessons;
drop policy if exists "Users can delete own lessons" on public.lessons;

-- Recreate policies with admin access
-- Users can view lessons of their own courses OR admins can view all lessons
create policy "Users can view own lessons"
  on public.lessons
  for select
  using (
    auth.uid() = (select user_id from public.courses where id = course_id)
    or public.is_admin()
  );

-- Users can insert lessons for their own courses OR admins can insert any lesson
create policy "Users can insert own lessons"
  on public.lessons
  for insert
  with check (
    auth.uid() = (select user_id from public.courses where id = course_id)
    or public.is_admin()
  );

-- Users can update lessons of their own courses OR admins can update any lesson
create policy "Users can update own lessons"
  on public.lessons
  for update
  using (
    auth.uid() = (select user_id from public.courses where id = course_id)
    or public.is_admin()
  )
  with check (
    auth.uid() = (select user_id from public.courses where id = course_id)
    or public.is_admin()
  );

-- Users can delete lessons of their own courses OR admins can delete any lesson
create policy "Users can delete own lessons"
  on public.lessons
  for delete
  using (
    auth.uid() = (select user_id from public.courses where id = course_id)
    or public.is_admin()
  );

-- ============================================================================
-- PART 5: Update source_files and course_assets RLS policies (Subtask 1.4)
-- ============================================================================

-- *** source_files table ***

-- Drop existing policies
drop policy if exists "Users can view own source files" on public.source_files;
drop policy if exists "Users can insert own source files" on public.source_files;
drop policy if exists "Users can update own source files" on public.source_files;
drop policy if exists "Users can delete own source files" on public.source_files;

-- Recreate policies with admin access
create policy "Users can view own source files"
  on public.source_files
  for select
  using (
    auth.uid() = (select user_id from public.courses where id = course_id)
    or public.is_admin()
  );

create policy "Users can insert own source files"
  on public.source_files
  for insert
  with check (
    auth.uid() = (select user_id from public.courses where id = course_id)
    or public.is_admin()
  );

create policy "Users can update own source files"
  on public.source_files
  for update
  using (
    auth.uid() = (select user_id from public.courses where id = course_id)
    or public.is_admin()
  )
  with check (
    auth.uid() = (select user_id from public.courses where id = course_id)
    or public.is_admin()
  );

create policy "Users can delete own source files"
  on public.source_files
  for delete
  using (
    auth.uid() = (select user_id from public.courses where id = course_id)
    or public.is_admin()
  );

-- *** course_assets table ***

-- Drop existing policies
drop policy if exists "Users can view own course assets" on public.course_assets;
drop policy if exists "Users can insert own course assets" on public.course_assets;
drop policy if exists "Users can update own course assets" on public.course_assets;
drop policy if exists "Users can delete own course assets" on public.course_assets;

-- Recreate policies with admin access
create policy "Users can view own course assets"
  on public.course_assets
  for select
  using (
    auth.uid() = (select user_id from public.courses where id = course_id)
    or public.is_admin()
  );

create policy "Users can insert own course assets"
  on public.course_assets
  for insert
  with check (
    auth.uid() = (select user_id from public.courses where id = course_id)
    or public.is_admin()
  );

create policy "Users can update own course assets"
  on public.course_assets
  for update
  using (
    auth.uid() = (select user_id from public.courses where id = course_id)
    or public.is_admin()
  )
  with check (
    auth.uid() = (select user_id from public.courses where id = course_id)
    or public.is_admin()
  );

create policy "Users can delete own course assets"
  on public.course_assets
  for delete
  using (
    auth.uid() = (select user_id from public.courses where id = course_id)
    or public.is_admin()
  );

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================

-- Comments for future reference:
-- 1. All existing RLS policies are preserved for regular users
-- 2. Admin users now have full access to all courses and related data
-- 3. Published courses remain accessible to everyone (public access)
-- 4. Helper functions is_admin() and get_user_role() can be used throughout the application
-- 5. Profiles are automatically created for new users via trigger
