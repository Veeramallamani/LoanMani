-- =========================================================
-- Supabase Initialization Script for Loan Default Prediction
-- =========================================================

-- 1. Enable Vector Extension (for AI RAG / Embeddings)
create extension if not exists vector;

-- 2. Create Users/Profiles table
create table public.profiles (
  id uuid references auth.users not null primary key,
  email text not null,
  full_name text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
-- Set up Row Level Security (RLS)
alter table public.profiles enable row level security;
create policy "Public profiles are viewable by everyone." on profiles for select using (true);
create policy "Users can insert their own profile." on profiles for insert with check (auth.uid() = id);
create policy "Users can update own profile." on profiles for update using (auth.uid() = id);

-- 3. Create Loan Applications table (Relational Data)
create table public.loan_applications (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id),
  applicant_age int,
  income numeric,
  loan_amount_requested numeric,
  tenure_months int,
  status text default 'pending',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table public.loan_applications enable row level security;
create policy "Users can view own loan applications." on loan_applications for select using (auth.uid() = user_id);
create policy "Users can insert own loan applications." on loan_applications for insert with check (auth.uid() = user_id);

-- 4. Create Chat History table (JSONB support)
create table public.chat_history (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id),
  session_id text not null unique,           -- UNIQUE required for upsert ON CONFLICT
  messages jsonb not null default '[]'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);
-- Index for fast lookup by user and session
create index if not exists idx_chat_history_session_id on public.chat_history(session_id);
create index if not exists idx_chat_history_user_id on public.chat_history(user_id);
alter table public.chat_history enable row level security;
create policy "Users can view own chat history." on chat_history for select using (auth.uid() = user_id);
create policy "Users can insert own chat history." on chat_history for insert with check (auth.uid() = user_id);
create policy "Users can update own chat history." on chat_history for update using (auth.uid() = user_id);

-- If the table already exists, run these ALTER statements instead:
-- ALTER TABLE public.chat_history ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone default now();
-- ALTER TABLE public.chat_history ADD CONSTRAINT chat_history_session_id_key UNIQUE (session_id);
-- CREATE INDEX IF NOT EXISTS idx_chat_history_session_id ON public.chat_history(session_id);

-- 5. Set up Supabase Storage for Documents
insert into storage.buckets (id, name, public) values ('documents', 'documents', false);
create policy "Users can upload own documents" on storage.objects for insert with check ( bucket_id = 'documents' and auth.uid() = owner );
create policy "Users can view own documents" on storage.objects for select using ( bucket_id = 'documents' and auth.uid() = owner );

-- 6. (Optional) Example Vector table for Document Embeddings
create table public.document_embeddings (
  id uuid default uuid_generate_v4() primary key,
  content text,
  embedding vector(1536) -- size depends on the embedding model you use (e.g., 1536 for OpenAI)
);
