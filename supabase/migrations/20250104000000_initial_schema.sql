-- Enable necessary extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- Create courses table
create table public.courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  slug text unique not null,
  published boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Create lessons table
create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  order_index int not null,
  title text not null,
  logline text,
  objectives jsonb not null default '[]'::jsonb,
  guiding_questions jsonb not null default '[]'::jsonb,
  expansion_tips jsonb not null default '[]'::jsonb,
  examples_to_add jsonb not null default '[]'::jsonb,
  content text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Create source_files table
create table public.source_files (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  filename text not null,
  mime text not null,
  text_content text,
  storage_path text,
  created_at timestamptz default now()
);

-- Create course_assets table
create table public.course_assets (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  lesson_id uuid references public.lessons(id) on delete set null,
  storage_path text not null,
  caption text,
  created_at timestamptz default now()
);

-- Create indexes for better query performance
create index idx_courses_user_id on public.courses(user_id);
create index idx_courses_published on public.courses(published);
create index idx_courses_slug on public.courses(slug);
create index idx_lessons_course_id on public.lessons(course_id);
create index idx_lessons_order on public.lessons(course_id, order_index);
create index idx_source_files_course_id on public.source_files(course_id);
create index idx_course_assets_course_id on public.course_assets(course_id);
create index idx_course_assets_lesson_id on public.course_assets(lesson_id);

-- Create function to update updated_at timestamp
create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Create triggers for updated_at
create trigger update_courses_updated_at
  before update on public.courses
  for each row
  execute function public.update_updated_at_column();

create trigger update_lessons_updated_at
  before update on public.lessons
  for each row
  execute function public.update_updated_at_column();

-- Enable Row Level Security on all tables
alter table public.courses enable row level security;
alter table public.lessons enable row level security;
alter table public.source_files enable row level security;
alter table public.course_assets enable row level security;

-- RLS Policies for courses table
-- Users can view their own courses
create policy "Users can view own courses"
  on public.courses
  for select
  using (auth.uid() = user_id);

-- Users can view published courses (public access)
create policy "Anyone can view published courses"
  on public.courses
  for select
  using (published = true);

-- Users can insert their own courses
create policy "Users can insert own courses"
  on public.courses
  for insert
  with check (auth.uid() = user_id);

-- Users can update their own courses
create policy "Users can update own courses"
  on public.courses
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Users can delete their own courses
create policy "Users can delete own courses"
  on public.courses
  for delete
  using (auth.uid() = user_id);

-- RLS Policies for lessons table
-- Users can view lessons of their own courses
create policy "Users can view own lessons"
  on public.lessons
  for select
  using (
    auth.uid() = (select user_id from public.courses where id = course_id)
  );

-- Users can view lessons of published courses
create policy "Anyone can view published lessons"
  on public.lessons
  for select
  using (
    exists (
      select 1 from public.courses
      where id = course_id and published = true
    )
  );

-- Users can insert lessons for their own courses
create policy "Users can insert own lessons"
  on public.lessons
  for insert
  with check (
    auth.uid() = (select user_id from public.courses where id = course_id)
  );

-- Users can update lessons of their own courses
create policy "Users can update own lessons"
  on public.lessons
  for update
  using (
    auth.uid() = (select user_id from public.courses where id = course_id)
  )
  with check (
    auth.uid() = (select user_id from public.courses where id = course_id)
  );

-- Users can delete lessons of their own courses
create policy "Users can delete own lessons"
  on public.lessons
  for delete
  using (
    auth.uid() = (select user_id from public.courses where id = course_id)
  );

-- RLS Policies for source_files table
-- Users can view source files of their own courses
create policy "Users can view own source files"
  on public.source_files
  for select
  using (
    auth.uid() = (select user_id from public.courses where id = course_id)
  );

-- Users can insert source files for their own courses
create policy "Users can insert own source files"
  on public.source_files
  for insert
  with check (
    auth.uid() = (select user_id from public.courses where id = course_id)
  );

-- Users can update source files of their own courses
create policy "Users can update own source files"
  on public.source_files
  for update
  using (
    auth.uid() = (select user_id from public.courses where id = course_id)
  )
  with check (
    auth.uid() = (select user_id from public.courses where id = course_id)
  );

-- Users can delete source files of their own courses
create policy "Users can delete own source files"
  on public.source_files
  for delete
  using (
    auth.uid() = (select user_id from public.courses where id = course_id)
  );

-- RLS Policies for course_assets table
-- Users can view assets of their own courses
create policy "Users can view own course assets"
  on public.course_assets
  for select
  using (
    auth.uid() = (select user_id from public.courses where id = course_id)
  );

-- Users can view assets of published courses
create policy "Anyone can view published course assets"
  on public.course_assets
  for select
  using (
    exists (
      select 1 from public.courses
      where id = course_id and published = true
    )
  );

-- Users can insert assets for their own courses
create policy "Users can insert own course assets"
  on public.course_assets
  for insert
  with check (
    auth.uid() = (select user_id from public.courses where id = course_id)
  );

-- Users can update assets of their own courses
create policy "Users can update own course assets"
  on public.course_assets
  for update
  using (
    auth.uid() = (select user_id from public.courses where id = course_id)
  )
  with check (
    auth.uid() = (select user_id from public.courses where id = course_id)
  );

-- Users can delete assets of their own courses
create policy "Users can delete own course assets"
  on public.course_assets
  for delete
  using (
    auth.uid() = (select user_id from public.courses where id = course_id)
  );
