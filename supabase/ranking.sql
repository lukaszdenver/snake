-- Ranking top 10 gry Snake. Uruchamiać w Supabase: SQL Editor -> New query -> Run.
-- Skrypt można uruchomić ponownie: nie usuwa danych, odtwarza uprawnienia i polityki.

create table if not exists public.wyniki (
  id bigint generated always as identity primary key,
  imie text not null
    check (char_length(imie) between 1 and 20 and imie ~ '[^[:space:]]'),
  punkty int not null
    check (punkty between 1 and 397),
  utworzono timestamptz not null default now()
);

create index if not exists wyniki_ranking_idx
  on public.wyniki (punkty desc, utworzono asc);

alter table public.wyniki enable row level security;

-- Najpierw odbieramy wszystko, potem nadajemy tylko to, czego potrzebuje gra.
revoke all on public.wyniki from anon, authenticated;
grant select on public.wyniki to anon;
-- Gracz ustawia tylko imię i punkty; id i utworzono nadaje baza.
grant insert (imie, punkty) on public.wyniki to anon;

drop policy if exists wyniki_select_anon on public.wyniki;
create policy wyniki_select_anon on public.wyniki
  for select to anon using (true);

drop policy if exists wyniki_insert_anon on public.wyniki;
create policy wyniki_insert_anon on public.wyniki
  for insert to anon with check (true);

-- Brak uprawnień i polityk na update/delete: wpisów nie da się zmienić ani usunąć kluczem publishable.
