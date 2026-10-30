-- Stylist thread, remembered preferences, mannequin renders, WhatsApp linking.

create table messages (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  role text not null check (role in ('user', 'assistant')),
  text text not null default '',
  cards jsonb not null default '[]',
  image_url text,
  channel text not null check (channel in ('web', 'whatsapp', 'system')),
  reply_to uuid references messages (id) on delete set null,
  wa_ids text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index messages_user_created on messages (user_id, created_at);
create index messages_wa_ids on messages using gin (wa_ids);
alter table messages enable row level security;

alter table profiles add column stylist_notes jsonb not null default '[]';
alter table profiles add column whatsapp_id text unique;
alter table profiles add column whatsapp_link_code text;
alter table profiles add column whatsapp_link_expires timestamptz;

alter table profiles drop constraint profiles_render_mode_check;
alter table profiles add constraint profiles_render_mode_check check (render_mode in ('tryon', 'mannequin', 'flatlay', 'none'));
