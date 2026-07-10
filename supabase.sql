-- 나율 하브루타 독서 기록 테이블
-- Supabase 대시보드 → SQL Editor에 붙여넣고 Run

create table if not exists nayul_records (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  book_title text,
  language_mode text,
  book_type text,
  stages_done text,
  memorable_quotes text,
  strengths text,
  next_goal text,
  next_question text,
  levels jsonb
);

-- 서버(서비스 롤 키)로만 접근하므로 RLS는 켜두기만 하면 됩니다.
alter table nayul_records enable row level security;

-- 우리집 서재 테이블 (v1.4)
create table if not exists nayul_library (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  title text not null,
  author text,
  publisher text,
  description text,
  thumbnail text,
  transcript text
);
alter table nayul_library enable row level security;
