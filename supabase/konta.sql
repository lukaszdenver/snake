-- Konta graczy i ranking gry Snake. Uruchamiać w Supabase: SQL Editor -> New query -> Run.
-- Pierwsze uruchomienie usuwa dawną tabelę wyniki (z kolumną imie) razem z zawartością — czysty start.
-- Kolejne uruchomienia niczego nie kasują: odtwarzają widok, funkcję, uprawnienia i polityki.

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'wyniki' and column_name = 'imie') then
    drop table public.wyniki cascade;
  end if;
end
$$;

create table if not exists public.gracze (
  id uuid primary key references auth.users (id) on delete cascade,
  login text not null unique check (login ~ '^[a-z0-9_]{3,20}$'),
  utworzono timestamptz not null default now()
);

create table if not exists public.wyniki (
  id bigint generated always as identity primary key,
  gracz_id uuid not null default auth.uid() references public.gracze (id) on delete cascade,
  punkty int not null check (punkty between 1 and 397),
  utworzono timestamptz not null default now()
);

create index if not exists wyniki_gracz_idx on public.wyniki (gracz_id, punkty desc, utworzono asc);
create index if not exists wyniki_ranking_idx on public.wyniki (punkty desc, utworzono asc);

-- Najlepszy wynik każdego gracza; security_invoker = widok podlega RLS tabel jak zwykłe zapytanie.
create or replace view public.najlepsze_wyniki with (security_invoker = true) as
  select distinct on (w.gracz_id) w.gracz_id, g.login, w.punkty, w.utworzono
  from public.wyniki w
  join public.gracze g on g.id = w.gracz_id
  order by w.gracz_id, w.punkty desc, w.utworzono asc;

-- Rejestracja w Supabase Auth zakłada gracza. Login zawsze bierze się z adresu <login>@gracze.example.com,
-- bo adres jest unikalny w Supabase Auth — metadanym od klienta nie ufamy (inaczej dałoby się zająć cudzy login).
-- Inna domena albo metadane niezgodne z adresem -> wyjątek -> konto nie powstaje.
-- Konto założone ręcznie w panelu działa, jeśli ma adres w tej domenie.
create or replace function public.utworz_gracza()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_login text := lower(split_part(new.email, '@', 1));
begin
  if lower(split_part(new.email, '@', 2)) <> 'gracze.example.com'
     or coalesce(lower(new.raw_user_meta_data ->> 'login'), v_login) <> v_login then
    raise exception 'Konto gracza musi mieć adres <login>@gracze.example.com zgodny z loginem';
  end if;
  insert into public.gracze (id, login) values (new.id, v_login);
  return new;
end;
$$;

drop trigger if exists po_rejestracji on auth.users;
create trigger po_rejestracji
  after insert on auth.users
  for each row execute function public.utworz_gracza();

alter table public.gracze enable row level security;
alter table public.wyniki enable row level security;

-- Najpierw odbieramy wszystko, potem nadajemy tylko to, czego potrzebuje gra.
revoke all on public.gracze, public.wyniki, public.najlepsze_wyniki from anon, authenticated;
revoke all on sequence public.wyniki_id_seq from anon, authenticated;
revoke all on function public.utworz_gracza() from public, anon, authenticated;

grant select on public.gracze, public.wyniki, public.najlepsze_wyniki to authenticated;
-- Gracz podaje tylko punkty; gracz_id ustawia baza z auth.uid().
grant insert (punkty) on public.wyniki to authenticated;

drop policy if exists gracze_select on public.gracze;
create policy gracze_select on public.gracze for select to authenticated using (true);

drop policy if exists wyniki_select on public.wyniki;
create policy wyniki_select on public.wyniki for select to authenticated using (true);

drop policy if exists wyniki_insert on public.wyniki;
create policy wyniki_insert on public.wyniki for insert to authenticated
  with check (gracz_id = (select auth.uid()));

-- Brak uprawnień i polityk na update/delete. Niezalogowani (anon) nie mają żadnego dostępu.
