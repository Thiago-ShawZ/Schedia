-- Schedia · Fase 5/6 · suporte a imagens de logo e avatar
alter table public.businesses add column if not exists logo_url text;
alter table public.profiles add column if not exists avatar_url text;
