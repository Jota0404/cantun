-- CANTUM — autenticação própria (ADR-059, B1 PR 2)
--
-- Credenciais, sessões e tokens de e-mail. Só o servidor (dono do schema)
-- acessa estas tabelas: RLS ligada sem políticas e nenhum grant para
-- cantum_user ou cantum_anon. Tokens e senhas nunca são guardados em claro.

alter table app.users
  add column password_hash text,
  add column email_verified_at timestamptz,
  add column updated_at timestamptz not null default now();

create table app.sessions (
  token_hash bytea primary key,
  user_id uuid not null references app.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  check (expires_at > created_at)
);

create index sessions_user_idx on app.sessions (user_id);

alter table app.sessions enable row level security;

create table app.email_tokens (
  token_hash bytea primary key,
  user_id uuid not null references app.users(id) on delete cascade,
  purpose text not null check (purpose in ('verify_email', 'reset_password')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  check (expires_at > created_at)
);

create index email_tokens_user_idx on app.email_tokens (user_id, purpose);

alter table app.email_tokens enable row level security;
