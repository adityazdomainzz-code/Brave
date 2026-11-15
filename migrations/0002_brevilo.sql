-- BREVILO per-user data. Auth tables live in 0001_auth.sql.
-- user_id is text to match Better Auth ids.

create table if not exists profiles (
  user_id text primary key,
  display_name text not null default '',
  accent text not null default '#6d4dff',
  theme text not null default 'dark',
  response_style text not null default 'balanced',
  enter_to_send boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint profiles_theme_chk check (theme in ('dark', 'light')),
  constraint profiles_style_chk check (response_style in ('concise', 'balanced', 'detailed'))
);

create table if not exists conversations (
  id text primary key,
  user_id text not null,
  title text not null,
  mode text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversations_mode_chk check (mode in ('assistant', 'code'))
);

create index if not exists conversations_user_idx on conversations (user_id, updated_at desc);

create table if not exists messages (
  id text primary key,
  conversation_id text not null references conversations (id) on delete cascade,
  user_id text not null,
  role text not null,
  content text not null,
  attachment_ids text not null default '',
  attachment_note text not null default '',
  created_at timestamptz not null default now(),
  constraint messages_role_chk check (role in ('user', 'assistant'))
);

create index if not exists messages_conv_idx on messages (conversation_id, created_at);

create table if not exists attachments (
  id text primary key,
  user_id text not null,
  conversation_id text references conversations (id) on delete set null,
  filename text not null,
  mime text not null,
  size_bytes integer not null,
  text_content text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists attachments_user_idx on attachments (user_id, created_at desc);
