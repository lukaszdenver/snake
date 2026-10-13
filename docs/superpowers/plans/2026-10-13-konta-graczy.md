# Konta graczy — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Logowanie loginem i hasłem (Supabase Auth), gra tylko dla zalogowanych, automatyczny zapis wyniku i dwie listy: „Moje najlepsze” oraz „Top 10 wszystkich”.

**Architecture:** `konto.js` rozmawia z `/auth/v1` (rejestracja, logowanie, odnawianie sesji w `localStorage`). `ranking.js` rozmawia z `/rest/v1` z tokenem gracza. Baza (`supabase/konta.sql`) ma tabele `gracze` i `wyniki`, widok `najlepsze_wyniki` i RLS: tylko `authenticated`, zapis wyłącznie na siebie. `index.html` dostaje kartę logowania nad planszą, pasek gracza, status zapisu i dwie listy.

**Tech Stack:** HTML5, Canvas 2D, JavaScript ES5/ES2015 bez modułów, `fetch` + `AbortController`, `TextEncoder`, Supabase Auth (GoTrue) + PostgREST + PostgreSQL, testy w `tests.html` (Edge headless).

**Spec:** `wymagania-snake.md` — sekcja 9 (konta i ranking), 10.1 testy 22–35, 10.2 pkt 12–23, sekcja 11.

## Global Constraints

- Zero modułów ES; zero bibliotek z sieci; gra działa z `file://` i z GitHub Pages.
- Supabase: `https://bakmagtitoppdzuolyvg.supabase.co`, klucz `sb_publishable_gTyd8RfeoCgdeFwVjXxVRA_9BV-POkI`. Klucz secret nigdy w repozytorium.
- Login: `trim().toLowerCase()`, potem `^[a-z0-9_]{3,20}$`. Adres techniczny `<login>@gracze.example.com`.
- Hasło: ≥ 8 znaków, ≤ 72 bajty UTF-8.
- Sesja w `localStorage` pod `snake.sesja` = `{access_token, refresh_token, expires_at, user_id, login}`; odnawianie, gdy do wygaśnięcia < 60 s.
- Limit 8 s na każde zapytanie.
- Treść z bazy tylko przez `textContent`.
- Komunikaty dosłownie jak w spec 9.6.
- `snake-logic.js` bez zmian; testy 1–21 dalej przechodzą.

## Review Focus

1. **Spóźniona odpowiedź po wylogowaniu** — zapis lub pobranie list, które wróci po „Wyloguj”, nie może pokazać „Sesja wygasła”, list ani statusu w stanie wylogowanym (licznik `authEpoch`). Pinowane w Task 5, harness test 6.
2. **Podwójny zapis wyniku** — koniec gry wywołuje zapis dokładnie raz, a „Spróbuj ponownie” nie da się kliknąć dwa razy w trakcie zapisu. Pinowane w Task 5, harness test 4.
3. **Gra bez sesji** — strzałki przy widocznej karcie logowania nie startują gry, także gdy fokus nie jest w karcie. Pinowane w Task 5, harness test 1.
4. **Równoczesne odnawianie sesji** — listy i zapis wołają `validSession` naraz przy wygasającym tokenie: jedno zapytanie `refresh_token` (rotacja tokenów w Supabase unieważnia stary). Pinowane w Task 3, krok 2.
5. **Rejestracja z niepoprawnym loginem obejściem klienta** — baza odrzuca (wyzwalacz łamie `check`), konto nie powstaje. Pinowane w Task 1, krok 4.

---

### Task 1: Baza: gracze, wyniki, widok, wyzwalacz, RLS

**Files:**
- Create: `supabase/konta.sql`
- Delete: `supabase/ranking.sql`

**Interfaces:**
- Produces: `POST /auth/v1/signup` z `data.login` tworzy wiersz w `gracze`; `GET /rest/v1/najlepsze_wyniki?select=login,punkty`, `GET /rest/v1/wyniki?select=punkty,utworzono&gracz_id=eq.<uuid>`, `POST /rest/v1/wyniki {punkty}` — tylko z `Authorization: Bearer`.

- [ ] **Step 1: Skrypt**

`supabase/konta.sql`:
```sql
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

-- Rejestracja w Supabase Auth zakłada gracza. Login z metadanych; konto założone ręcznie w panelu
-- (bez metadanych) dostaje login z części adresu przed @.
create or replace function public.utworz_gracza()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.gracze (id, login)
  values (new.id, lower(coalesce(new.raw_user_meta_data ->> 'login', split_part(new.email, '@', 1))));
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
```
Usuń `supabase/ranking.sql` (`git rm`).

- [ ] **Step 2: Użytkownik ustawia Supabase i uruchamia skrypt**

1. Authentication → Sign In / Providers → Email: „Confirm email” **wyłączone**, rejestracja dozwolona.
2. Minimalna długość hasła: 8.
3. SQL Editor → New query → wklej `supabase/konta.sql` → Run → „Success. No rows returned”.

- [ ] **Step 3: Rejestracja i logowanie przez REST**

Run (PowerShell; pomocnicza funkcja `Call` drukuje status i treść): rejestracja `test_claude_a` i `test_claude_b` z hasłem `Testowe-haslo-1`, ponowna rejestracja `test_claude_a`, logowanie złym hasłem.
Expected: dwa `200` z `access_token`; duplikat → `422` z `"error_code":"user_already_exists"`; złe hasło → `400` z `"error_code":"invalid_credentials"`. Jeśli adres `@gracze.example.com` zostanie odrzucony (`email_address_invalid`) — Ruling: inna zarezerwowana domena, zmiana stałej w Task 2.

- [ ] **Step 4: Reguły dostępu przez REST**

Expected:
- bez tokenu: `GET /rest/v1/wyniki` i `POST` → `401` z `42501`
- `a`: `POST {punkty:5}` → `201`; `POST {punkty:1000}` → `400 23514`; `POST {punkty:5, gracz_id:<b>}` → `401/403 42501`; `PATCH`/`DELETE` → `401/403 42501`
- `b`: `GET najlepsze_wyniki?select=login,punkty` → `[{"login":"test_claude_a","punkty":5}]`; `GET wyniki?gracz_id=eq.<b>` → `[]`
- rejestracja `{data:{login:"a-b"}}` z poprawnym adresem → błąd `500`/`unexpected_failure` („Database error saving new user”), konto nie powstaje.

Konta testowe usuwa użytkownik w panelu (Authentication → Users); wyniki znikają kaskadowo.

- [ ] **Step 5: Commit** — `git add supabase/konta.sql && git rm supabase/ranking.sql && git commit -m "Konta: baza gracze/wyniki, widok najlepszych, RLS"`

---

### Task 2: `konto.js` — czyste funkcje (testy 28–34)

**Files:**
- Create: `konto.js`
- Modify: `tests.html` (skrypt `konto.js`; usunięcie testów 22–28 `normalizeName`/`qualifies`, przenumerowanie testów nieba 29–34 → 22–27, nowe 28–34)

**Interfaces:**
- Produces: `SnakeAccount.normalizeLogin(raw) => string|null`, `passwordError(pw) => null|'too_short'|'too_long'`, `loginToEmail(login) => string`, `needsRefresh(session, nowMs) => boolean`, `authErrorCode(status, body) => string`.

- [ ] **Step 1: Testy (najpierw czerwone)** — w `tests.html` dodaj `<script src="konto.js"></script>` przed `ranking.js`, `var A = window.SnakeAccount;`, usuń testy `22.`–`28.` i `topOf`, przenumeruj testy nieba na `22.`–`27.`, dodaj:
```js
      test('28. normalizeLogin przycina i zamienia na małe litery', function () {
        eq(A.normalizeLogin('  Lukasz '), 'lukasz');
        eq(A.normalizeLogin('Ala_1'), 'ala_1');
      });

      test('29. normalizeLogin odrzuca niepoprawne loginy', function () {
        ['', 'ab', 'abcdefghijklmnopqrstu', 'łukasz', 'jan kowalski', 'a-b', null].forEach(function (raw) {
          eq(A.normalizeLogin(raw), null, JSON.stringify(raw));
        });
      });

      test('30. normalizeLogin przyjmuje 3 i 20 znaków', function () {
        eq(A.normalizeLogin('abc'), 'abc');
        eq(A.normalizeLogin('abcdefghijklmnopqrst'), 'abcdefghijklmnopqrst');
      });

      test('31. passwordError: 8 znaków do 72 bajtów', function () {
        eq(A.passwordError('1234567'), 'too_short', '7 znaków');
        eq(A.passwordError('12345678'), null, '8 znaków');
        eq(A.passwordError(new Array(73).join('a')), null, '72 bajty');
        eq(A.passwordError(new Array(38).join('ł')), 'too_long', '37 × ł = 74 bajty');
      });

      test('32. loginToEmail dokleja domenę techniczną', function () {
        eq(A.loginToEmail('lukasz'), 'lukasz@gracze.example.com');
      });

      test('33. needsRefresh: margines 60 s', function () {
        var now = 1000000000000;
        eq(A.needsRefresh({ expires_at: now / 1000 + 120 }, now), false, 'za 120 s');
        eq(A.needsRefresh({ expires_at: now / 1000 + 59 }, now), true, 'za 59 s');
        eq(A.needsRefresh({ expires_at: now / 1000 - 5 }, now), true, 'wygasła');
      });

      test('34. authErrorCode tłumaczy kody Supabase Auth', function () {
        eq(A.authErrorCode(422, { error_code: 'user_already_exists' }), 'login_taken');
        eq(A.authErrorCode(400, { error_code: 'invalid_credentials' }), 'invalid_credentials');
        eq(A.authErrorCode(422, { error_code: 'weak_password' }), 'weak_password');
        eq(A.authErrorCode(500, { error_code: 'unexpected_failure' }), 'unknown');
        eq(A.authErrorCode(502, null), 'unknown');
      });
```
Run: runner Edge headless. Expected: 28–34 `BŁĄD` (brak `SnakeAccount`).

- [ ] **Step 2: Implementacja** — `konto.js` z funkcjami czystymi (kod: Task 3 zawiera plik w całości; w tym kroku tylko część czysta + eksport tych pięciu funkcji).
- [ ] **Step 3: Testy zielone** — Expected: wszystkie przechodzą (tests.html: 21 + 6 + 7 = 34; testy rankingu 35 dochodzą w Task 4).
- [ ] **Step 4: Commit** — `"Konta: walidacja loginu i hasła, adres techniczny, odnawianie (konto.js)"`

---

### Task 3: `konto.js` — rejestracja, logowanie, sesja

**Files:** Modify: `konto.js`. Test tymczasowy: `<scratchpad>/konto-net.html`.

**Interfaces:**
- Produces: `signUp(login, pw) => Promise<session>`, `signIn(login, pw) => Promise<session>`, `signOut() => Promise<void>`, `currentSession() => session|null`, `validSession() => Promise<session>`; błędy `Error` z `code` ∈ `login_taken|invalid_credentials|weak_password|session_expired|network|unknown`.

- [ ] **Step 1: Strona testowa (czerwona)** — `konto-net.html` ładuje `konto.js`, czyści `localStorage`, potem kolejno: `signIn('test_claude_a', zle)` → oczekiwany `invalid_credentials`; `signUp('test_claude_a', ...)` → `login_taken`; `signIn('TEST_CLAUDE_A', dobre)` → sesja z `login:'test_claude_a'`; `currentSession()` zgodna; sztuczne `expires_at = teraz + 10 s` i dwa równoczesne `validSession()` → oba z tym samym nowym `access_token`, licznik zapytań `refresh_token` = 1 (podmieniony `fetch` liczący); `signOut()` → `currentSession() === null`; `validSession()` → `session_expired`. Expected przed implementacją: `BŁĄD … is not a function`.
- [ ] **Step 2: Implementacja** — pełny `konto.js`:

```js
// Konta graczy w Supabase Auth. Bez DOM i Canvas; jedyne kontakty z otoczeniem to fetch,
// localStorage (sesja) i eksport window.SnakeAccount.
(function (global) {
  'use strict';

  var AUTH_URL = 'https://bakmagtitoppdzuolyvg.supabase.co/auth/v1';
  // Klucz publishable jest publiczny z założenia; dostęp do danych ogranicza RLS w supabase/konta.sql.
  var API_KEY = 'sb_publishable_gTyd8RfeoCgdeFwVjXxVRA_9BV-POkI';
  // Supabase Auth wymaga e-maila; example.com jest zarezerwowana (RFC 2606), więc adres nikogo nie dotyczy.
  var EMAIL_DOMAIN = '@gracze.example.com';
  var SESSION_KEY = 'snake.sesja';
  var TIMEOUT_MS = 8000;
  var REFRESH_MARGIN_MS = 60000;
  var MIN_PASSWORD_CHARS = 8;
  var MAX_PASSWORD_BYTES = 72;  // limit haszowania bcrypt w Supabase Auth

  var ERROR_CODES = {
    user_already_exists: 'login_taken',
    invalid_credentials: 'invalid_credentials',
    weak_password: 'weak_password'
  };

  function normalizeLogin(raw) {
    var login = String(raw == null ? '' : raw).trim().toLowerCase();
    return /^[a-z0-9_]{3,20}$/.test(login) ? login : null;
  }

  function passwordError(password) {
    var p = String(password == null ? '' : password);
    if (Array.from(p).length < MIN_PASSWORD_CHARS) return 'too_short';
    if (new TextEncoder().encode(p).length > MAX_PASSWORD_BYTES) return 'too_long';
    return null;
  }

  function loginToEmail(login) {
    return login + EMAIL_DOMAIN;
  }

  function needsRefresh(session, nowMs) {
    return session.expires_at * 1000 - nowMs < REFRESH_MARGIN_MS;
  }

  function authErrorCode(status, body) {
    return (body && ERROR_CODES[body.error_code]) || 'unknown';
  }

  function fail(code, cause) {
    var err = new Error(code);
    err.code = code;
    err.cause = cause;
    return err;
  }

  // POST do Supabase Auth z limitem czasu; błąd sieci -> 'network', status spoza 2xx -> kod z authErrorCode.
  function authRequest(path, body, token) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);
    var headers = { apikey: API_KEY, 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    return fetch(AUTH_URL + path, { method: 'POST', headers: headers, body: JSON.stringify(body), signal: ctrl.signal })
      .then(function (res) {
        return res.text().then(function (text) { return { res: res, text: text }; });
      })
      .then(function (r) {
        clearTimeout(timer);
        var data = null;
        try { data = r.text ? JSON.parse(r.text) : null; } catch (e) { data = null; }
        if (!r.res.ok) throw fail(authErrorCode(r.res.status, data));
        return data;
      }, function (err) {
        clearTimeout(timer);
        throw fail('network', err);
      });
  }

  function toSession(data, login) {
    if (!data || !data.access_token || !data.refresh_token || !data.user) throw fail('unknown');
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at || Math.floor(Date.now() / 1000) + data.expires_in,
      user_id: data.user.id,
      login: login
    };
  }

  function store(session) {
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch (e) { /* bez pamięci sesja żyje do odświeżenia */ }
    return session;
  }

  function clear() {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* nic do wyczyszczenia */ }
  }

  function currentSession() {
    try {
      var s = JSON.parse(localStorage.getItem(SESSION_KEY));
      return s && s.access_token && s.refresh_token && s.user_id && s.login ? s : null;
    } catch (e) {
      return null;
    }
  }

  function signUp(login, password) {
    return authRequest('/signup', { email: loginToEmail(login), password: password, data: { login: login } })
      .then(function (data) { return store(toSession(data, login)); });
  }

  function signIn(login, password) {
    return authRequest('/token?grant_type=password', { email: loginToEmail(login), password: password })
      .then(function (data) { return store(toSession(data, login)); });
  }

  function signOut() {
    var s = currentSession();
    clear();
    if (!s) return Promise.resolve();
    return authRequest('/logout', {}, s.access_token).then(function () {}, function () {});
  }

  // Jedno odnawianie naraz: Supabase rotuje refresh_token, więc drugie równoległe zapytanie użyłoby zużytego.
  var refreshing = null;

  function validSession() {
    var s = currentSession();
    if (!s) return Promise.reject(fail('session_expired'));
    if (!needsRefresh(s, Date.now())) return Promise.resolve(s);
    if (!refreshing) {
      refreshing = authRequest('/token?grant_type=refresh_token', { refresh_token: s.refresh_token })
        .then(function (data) {
          return store(toSession(data, s.login));
        }, function (err) {
          if (err.code === 'network') throw err;
          clear();
          throw fail('session_expired', err);
        })
        .then(function (fresh) {
          refreshing = null;
          return fresh;
        }, function (err) {
          refreshing = null;
          throw err;
        });
    }
    return refreshing;
  }

  global.SnakeAccount = {
    normalizeLogin: normalizeLogin,
    passwordError: passwordError,
    loginToEmail: loginToEmail,
    needsRefresh: needsRefresh,
    authErrorCode: authErrorCode,
    signUp: signUp,
    signIn: signIn,
    signOut: signOut,
    currentSession: currentSession,
    validSession: validSession
  };
})(window);
```
- [ ] **Step 3: Strona testowa zielona + tests.html zielone.**
- [ ] **Step 4: Commit** — `"Konta: rejestracja, logowanie i sesja (konto.js)"`

---

### Task 4: `ranking.js` dla zalogowanych (test 35)

**Files:** Modify: `ranking.js` (całość), `tests.html` (test 35). Test tymczasowy: `<scratchpad>/ranking-net.html`.

**Interfaces:**
- Consumes: `session` z Task 3 (`access_token`, `user_id`).
- Produces: `SnakeRanking.isPersonalBest(myTop, score)`, `fetchGlobalTop(session) => Promise<[{login, punkty}]>`, `fetchMyTop(session) => Promise<[{punkty, utworzono}]>`, `submit(session, score) => Promise<void>`.

- [ ] **Step 1: Test 35 (czerwony)**
```js
      test('35. isPersonalBest: lepszy od najlepszego własnego wyniku', function () {
        eq(R.isPersonalBest([], 1), true, 'pierwsza gra');
        eq(R.isPersonalBest([], 0), false, 'zero punktów');
        var mine = [{ punkty: 10 }, { punkty: 7 }];
        eq(R.isPersonalBest(mine, 11), true, 'lepszy');
        eq(R.isPersonalBest(mine, 10), false, 'równy');
        eq(R.isPersonalBest(mine, 9), false, 'gorszy');
      });
```
- [ ] **Step 2: Implementacja** — pełny `ranking.js`:
```js
// Ranking gry Snake w Supabase w imieniu zalogowanego gracza. Bez DOM i Canvas;
// jedyny kontakt z otoczeniem to fetch i eksport window.SnakeRanking.
(function (global) {
  'use strict';

  var TOP_N = 10;
  var TIMEOUT_MS = 8000;
  var REST_URL = 'https://bakmagtitoppdzuolyvg.supabase.co/rest/v1';
  // Klucz publishable jest publiczny z założenia; dostęp ogranicza RLS w supabase/konta.sql.
  var API_KEY = 'sb_publishable_gTyd8RfeoCgdeFwVjXxVRA_9BV-POkI';

  // Remis z dotychczasowym rekordem nie jest nowym rekordem.
  function isPersonalBest(myTop, score) {
    if (score < 1) return false;
    return myTop.length === 0 || score > myTop[0].punkty;
  }

  // fetch z kluczem, tokenem gracza i limitem czasu (także na odczyt treści); status spoza 2xx to błąd.
  function request(session, path, options) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);
    options.signal = ctrl.signal;
    options.headers = Object.assign({ apikey: API_KEY, Authorization: 'Bearer ' + session.access_token }, options.headers);
    return fetch(REST_URL + path, options)
      .then(function (res) {
        return res.text().then(function (text) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return text ? JSON.parse(text) : null;
        });
      })
      .then(function (data) {
        clearTimeout(timer);
        return data;
      }, function (err) {
        clearTimeout(timer);
        throw err;
      });
  }

  function fetchGlobalTop(session) {
    return request(session, '/najlepsze_wyniki?select=login,punkty&order=punkty.desc,utworzono.asc&limit=' + TOP_N, { method: 'GET' });
  }

  function fetchMyTop(session) {
    var path = '/wyniki?select=punkty,utworzono&gracz_id=eq.' + encodeURIComponent(session.user_id) +
      '&order=punkty.desc,utworzono.asc&limit=' + TOP_N;
    return request(session, path, { method: 'GET' });
  }

  function submit(session, score) {
    return request(session, '/wyniki', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ punkty: score })
    }).then(function () {});
  }

  global.SnakeRanking = {
    isPersonalBest: isPersonalBest,
    fetchGlobalTop: fetchGlobalTop,
    fetchMyTop: fetchMyTop,
    submit: submit
  };
})(window);
```
- [ ] **Step 3: Testy zielone (35/35) + strona sieciowa** — zalogowanie `test_claude_b`, `submit(7)`, `fetchMyTop` → `[{punkty:7,…}]`, `fetchGlobalTop` zawiera `test_claude_b — 7` i `test_claude_a — 5` (każdy raz), `submit(1000)` → odrzucone `HTTP 400`.
- [ ] **Step 4: Commit** — `"Konta: ranking dla zalogowanych (ranking.js)"`

---

### Task 5: Interfejs w `index.html`

**Files:** Modify: `index.html`. Test tymczasowy: `<scratchpad>/ui-konta.html` (index w iframe `srcdoc`, podmieniony `fetch` emulujący `/auth/v1` i `/rest/v1`, `requestAnimationFrame` → `setTimeout`).

**Interfaces:** Consumes: wszystko z Task 3 i 4.

- [ ] **Step 1: Harness (czerwony)** — testy:
  1. bez sesji: karta widoczna, `ArrowUp` na `document` nie zmienia licznika punktów ani nie startuje gry (podmieniony `SnakeLogic.step` liczy wywołania = 0);
  2. logowanie złym hasłem → komunikat „Zły login lub hasło”;
  3. logowanie dobre → karta ukryta, pasek „test”, „Top 10 wszystkich” z wyróżnionym wierszem `test`;
  4. koniec gry (wymuszony `step`) z wynikiem 5 → dokładnie jeden `POST /rest/v1/wyniki`, status „Wynik zapisany”;
  5. zapis z błędem → „Nie udało się zapisać” + przycisk; dwa kliknięcia „Spróbuj ponownie” → jeden dodatkowy `POST`;
  6. „Wyloguj” w trakcie wiszącego zapisu, potem odrzucenie zapisu → karta bez komunikatu, status ukryty.
- [ ] **Step 2: Implementacja** — markup, style i skrypt wg spec 9.6 (karta logowania `#auth-card` nad Canvasem, pasek `#player`, `#save-status` z `#retry-btn`, `#ranking` z dwiema kolumnami; `authEpoch` dla spóźnionych odpowiedzi; `withSession`; usunięcie formularza imienia).
- [ ] **Step 3: Harness zielony, tests.html zielone, zrzut ekranu karty i list.**
- [ ] **Step 4: Commit** — `"Konta: karta logowania, pasek gracza, automatyczny zapis i dwie listy"`

---

### Task 6: Recenzja i publikacja

- [ ] Recenzja całej gałęzi (subagent, najmocniejszy model), poprawki Critical/Important z testem RED→GREEN.
- [ ] Weryfikacja ręczna z użytkownikiem (spec 10.2 pkt 12–21).
- [ ] Za zgodą użytkownika: `git switch main && git merge --ff-only konta && git push moj main konta tlo-animacja`; sprawdzenie GitHub Pages (pkt 23).
