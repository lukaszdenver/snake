# Snake — specyfikacja projektowa

- **Data:** 2026-09-29, rozszerzona o ranking, grafikę i konta graczy 2026-10-13
- **Status:** zatwierdzona, gotowa do planu implementacji
- **Stos:** HTML5 + Canvas 2D + JavaScript (ES5/ES2015, bez modułów), zero zależności w kodzie; konta i ranking korzystają z zewnętrznej usługi Supabase (sekcja 9)

## 1. Cel i zakres

Klasyczny Snake uruchamiany dwuklikiem na pliku `index.html`, bez serwera, bez `npm install`, bez kroku budowania. Wąż porusza się po siatce, zjada jedzenie, rośnie i przyspiesza. Plansza zawija się na krawędziach — wyjście poza krawędź przenosi głowę na przeciwległą stronę, bez utraty gry. Jedynym końcem gry jest ugryzienie własnego ciała.

**W zakresie:** siatka, ruch, jedzenie, wzrost, punktacja, rosnące tempo, zawijanie planszy na krawędziach, kolizja z własnym ciałem, ekran startowy, ekran końca gry, ekran wygranej, restart, automatyczne testy logiki, animowane niebo, konta graczy (login + hasło) i ranking w Supabase (sekcja 9).

**Poza zakresem:** gra bez logowania, logowanie e-mailem, samodzielny reset hasła, zmiana loginu lub hasła i usuwanie konta z poziomu gry, lokalne rekordy w `localStorage`, poziomy trudności, przeszkody, bonusowe jedzenie, dźwięk, sterowanie dotykowe, ochrona rankingu przed sfałszowanymi wynikami, tryb dwuosobowy, animacje ruchu między komórkami.

## 2. Struktura plików

| Plik | Odpowiedzialność | Zależności |
|---|---|---|
| `snake-logic.js` | Czysta logika gry. Zero DOM, zero Canvas, zero `window` poza jednym eksportem. | brak |
| `konto.js` | Konta graczy w Supabase Auth: rejestracja, logowanie, wylogowanie, zapamiętanie i odnawianie sesji, sprawdzanie loginu i hasła. Zero DOM, zero Canvas; jedyny dostęp do `localStorage` to sesja. | brak (`fetch` przeglądarki) |
| `ranking.js` | Komunikacja z rankingiem w Supabase w imieniu zalogowanego gracza i czyste funkcje pomocnicze rankingu. Zero DOM, zero Canvas. | brak (`fetch` przeglądarki) |
| `index.html` | Prezentacja: Canvas, style, pętla czasu, rysowanie, odczyt klawiatury, karta logowania, pasek gracza, dwie listy rankingu, status zapisu. | `snake-logic.js`, `konto.js`, `ranking.js`, `tlo-animacja.js` |
| `tests.html` | Runner testów logiki, animacji nieba, kont i rankingu z wypisem wyników w przeglądarce. | `snake-logic.js`, `konto.js`, `ranking.js`, `tlo-animacja.js` |
| `tlo-animacja.js` | Animowane niebo: migające gwiazdki i spadające gwiazdy (sekcja 8). Rysuje na podanym kontekście Canvas. | brak |
| `img/` | Grafiki planszy: tło, trzy owoce, głowa węża (sekcja 8). | brak |
| `supabase/konta.sql` | Skrypt tworzący tabelę `gracze`, tabelę `wyniki`, widok `najlepsze_wyniki`, wyzwalacz rejestracji i reguły dostępu. Uruchamiany ręcznie w SQL Editor Supabase; zastępuje dawny `supabase/ranking.sql` (usunięty). | brak |

Oba pliki HTML ładują skrypty zwykłym `<script src="..."></script>`.

**Twardy zakaz:** żadnych modułów ES (`type="module"`, `import`, `export`). Przeglądarki blokują moduły wczytywane przez `file://` polityką CORS, co zabiłoby uruchamianie dwuklikiem. Logika wystawia się przez `window.SnakeLogic`.

## 3. Parametry gry

| Parametr | Wartość |
|---|---|
| Siatka | 20 × 20 komórek |
| Komórka | 24 px |
| Canvas | 480 × 480 px |
| Wąż na starcie | 3 segmenty, głowa `(10, 10)`, kierunek w prawo |
| Interwał startowy | 125 ms na krok |
| Przyspieszenie | −4 ms za każde zjedzone jedzenie |
| Interwał minimalny | 55 ms |
| Punkty | +1 za jedzenie |
| Wygrana | długość węża = 400 segmentów |

## 4. Model stanu

```js
{
  cols: 20,
  rows: 20,
  snake: [{x, y}, ...],   // indeks 0 = głowa, ostatni = koniec ogona
  direction: {x, y},      // aktualny kierunek, jeden z (1,0) (-1,0) (0,1) (0,-1)
  queue: [{x, y}, ...],   // bufor kierunków, maksymalnie 2 pozycje
  food: {x, y},
  score: 0,
  intervalMs: 125,
  status: 'ready'         // 'ready' | 'running' | 'over' | 'won'
}
```

Oś Y rośnie w dół (zgodnie z Canvas). Stan jest jedynym źródłem prawdy — warstwa prezentacji go nie modyfikuje poza wywołaniami API z sekcji 7.

## 5. Reguły kroku

`step(state)` wykonuje dokładnie jeden krok logiki, w tej kolejności:

1. Jeżeli `status !== 'running'` — brak zmian, wyjście.
2. Zdejmij pierwszy kierunek z `queue` i ustaw jako `direction` (jeśli kolejka niepusta).
3. Policz nową głowę: `head + direction`.
4. **Zawijanie planszy:** jeśli nowa głowa wypada poza `0..cols-1` lub `0..rows-1`, przenieś ją na przeciwległą krawędź: `x = (x + cols) % cols`, `y = (y + rows) % rows`. Ściana nigdy nie kończy gry.
5. **Kolizja z ciałem:** porównaj zawiniętą już głowę z segmentami węża. Jeżeli głowa *nie* trafia na jedzenie, ostatni segment jest w tym kroku zwalniany i **nie liczy się** jako kolizja — wejście na zwalniane pole ogona jest legalne. Jeżeli głowa trafia na jedzenie, ogon nie ustępuje i liczy się całe ciało. Kolizja → `status = 'over'`, wyjście.
6. Dołóż nową głowę na początek `snake`.
7. Jeśli głowa trafiła na jedzenie: `score += 1`, `intervalMs = max(55, intervalMs - 4)`, wylosuj nowe jedzenie. W przeciwnym razie usuń ostatni segment.
8. Jeśli `snake.length === cols * rows` → `status = 'won'`.

## 6. Sterowanie

- **Klawisze kierunku:** strzałki oraz `W` / `S` / `A` / `D` (wielkość liter bez znaczenia).
- **Start gry:** pierwszy klawisz kierunku przy `status === 'ready'` przełącza na `'running'`.
- **Restart:** `Spacja` lub `Enter` przy `status` `'over'` albo `'won'` tworzy świeży stan.
- **Zakaz zawracania:** kierunek przeciwny do obowiązującego jest odrzucany.
- **Bufor kierunków:** wciśnięcia trafiają do `queue` (maks. 2 pozycje), nie prosto do `direction`. Bez bufora dwa szybkie skręty między krokami logiki (np. góra → lewo) omijają walidację i wprowadzają węża w samego siebie — dla gracza wygląda to jak błąd gry.
- Walidacja kandydata odbywa się względem *ostatniego elementu kolejki*, a gdy kolejka jest pusta — względem `direction`. Duplikat bieżącego kierunku jest odrzucany.
- `keydown` dla strzałek i spacji wywołuje `preventDefault()`, żeby strona się nie przewijała.

## 7. API `snake-logic.js`

Jeden obiekt globalny `window.SnakeLogic`:

| Funkcja | Sygnatura | Opis |
|---|---|---|
| `createState` | `(rng?) => state` | Nowy stan startowy, `status: 'ready'`, jedzenie wylosowane. |
| `step` | `(state, rng?) => void` | Jeden krok wg sekcji 5. Mutuje stan w miejscu. |
| `enqueueDirection` | `(state, dir) => boolean` | Dokłada kierunek do kolejki. `false` gdy odrzucony. |
| `spawnFood` | `(state, rng?) => void` | Losuje jedzenie wyłącznie z pól wolnych od węża. |
| `start` | `(state) => void` | `'ready'` → `'running'`. |
| `DIRECTIONS` | stała | `{ up, down, left, right }` jako wektory. |

`rng` to opcjonalna funkcja zwracająca liczbę z `[0, 1)`; domyślnie `Math.random`. Wstrzykiwalność `rng` jest wymogiem, bez niej losowanie jedzenia nie da się przetestować deterministycznie.

## 8. Warstwa prezentacji (`index.html`)

- Pętla `requestAnimationFrame` z akumulatorem czasu: rysowanie w każdej klatce, `step()` dopiero gdy akumulator przekroczy `intervalMs`. Dzięki temu tempo gry nie zależy od częstotliwości odświeżania monitora.
- Akumulator jest ograniczony z góry (maks. 5 kroków w jednej klatce), żeby po powrocie z nieaktywnej karty gra nie wykonała setek kroków naraz.
- Nad planszą licznik: `Punkty: N`.
- Nakładka na Canvas zależna od `status`, gdy gracz jest zalogowany (bez sesji nakładka jest pusta, a nad planszą leży karta logowania — sekcja 9.6):
  - `ready` — „Strzałki lub WSAD — start"
  - `over` — „Koniec gry · Punkty: N" + (przy rekordzie osobistym) „Nowy rekord osobisty!" + „Spacja — nowa gra"
  - `won` — „Wygrana! Plansza zapełniona" + (przy rekordzie osobistym) „Nowy rekord osobisty!" + „Spacja — nowa gra"
- Grafiki z katalogu `img/`:
  - `tlo.jpg` — gwiaździste niebo na całą planszę (bez siatki).
  - `jablko.png`, `wisnia.png`, `winogrono.png` — jedzenie; owoc losowany przy każdym nowym położeniu jedzenia, rysowany w rozmiarze komórki + 4 px.
  - `glowa.png` — głowa węża narysowana w prawo, obracana o kąt bieżącego kierunku ruchu.
- Animowane niebo (`tlo-animacja.js`, obiekt `window.SnakeSky`), rysowane na tle w każdej klatce, także pod nakładkami:
  - 40 migających gwiazdek (promień 0,6–1,6 px, kolor biały / złotawy / bladoniebieski, rytm 2–6 s, jasność `0,15 + 0,85·(½ + ½·sin)^4`); co czwarta w szczycie rozbłysku dostaje czteroramienny błysk.
  - Spadająca gwiazda co 4–12 s (losowo): smuga 60–110 px po skosie w dół i w prawo, trwa 0,7 s, płynnie się pojawia i znika.
  - Przy systemowym „ogranicz animacje” (`prefers-reduced-motion: reduce`) gwiazdki świecą stałym blaskiem, a spadających gwiazd nie ma.
- Ciało węża w tęczy (`hsl(i·25 mod 360, 90%, 60%)` dla segmentu `i`), segmenty z zaokrąglonymi rogami (promień 7 px; bez `roundRect` — zwykły kwadrat).
- Gdy grafika się nie wczytała, element rysuje się zastępczo: tło `#10141c` z siatką `#1a2030`, jedzenie jako koło `#ef4444`, głowa jako biały kwadrat `#ffffff`. Tekst `#e2e8f0`.
- Głowa odróżniona od ciała, żeby kierunek był czytelny.

## 9. Konta graczy i ranking (Supabase)

Grają tylko zalogowani gracze. Każdy sam zakłada konto (login + hasło), a pod planszą widzi dwie listy: swoje 10 najlepszych gier i „Top 10 wszystkich” (najlepszy wynik każdego gracza, raz). Dane leżą w projekcie Supabase `https://bakmagtitoppdzuolyvg.supabase.co`. Gra łączy się z REST API Supabase (`/auth/v1`, `/rest/v1`) bezpośrednio przez `fetch` — bez biblioteki `supabase-js`. Zapytania z pliku otwartego przez `file://` działają, bo Supabase odpowiada nagłówkiem `Access-Control-Allow-Origin: *`.

### 9.1 Ustawienia projektu Supabase (ręcznie, raz)

- **Authentication → Sign In / Providers → Email:** dostawca Email włączony, **„Confirm email” wyłączone**, rejestracja nowych użytkowników dozwolona. Bez wyłączenia potwierdzeń Supabase czekałby na kliknięcie w mail, który nigdy nie przyjdzie.
- **Minimalna długość hasła:** 8 znaków (ustawienie haseł w Authentication).
- Skrypt `supabase/konta.sql` uruchomiony w SQL Editor.

### 9.2 Login, hasło i adres techniczny

- **Login:** po przycięciu białych znaków i zamianie na małe litery musi pasować do `^[a-z0-9_]{3,20}$`. Wielkość liter nie ma znaczenia (`Lukasz` i `lukasz` to ten sam login).
- **Hasło:** od 8 znaków do 72 bajtów w UTF-8 (72 bajty to limit haszowania bcrypt w Supabase Auth).
- **Adres techniczny:** Supabase Auth wymaga e-maila, więc login zamieniany jest na `<login>@gracze.example.com`. Domena `example.com` jest zarezerwowana (RFC 2606), więc adres nikogo nie dotyczy, a przy wyłączonych potwierdzeniach żaden mail nie jest wysyłany. Gracz nigdy tego adresu nie widzi.
- Unikalność loginu wynika z unikalności adresu w Supabase Auth; dodatkowo pilnuje jej `unique` w tabeli `gracze`.

### 9.3 Sesja

- Rejestracja: `POST /auth/v1/signup` z `{email, password, data: {login}}` — przy wyłączonych potwierdzeniach od razu zwraca sesję.
- Logowanie: `POST /auth/v1/token?grant_type=password` z `{email, password}`.
- Odnowienie: `POST /auth/v1/token?grant_type=refresh_token` z `{refresh_token}`.
- Wylogowanie: `POST /auth/v1/logout` z tokenem; błąd zapytania nie przeszkadza — sesja lokalna jest czyszczona zawsze.
- Sesja zapamiętana w `localStorage` pod kluczem `snake.sesja` jako `{access_token, refresh_token, expires_at, user_id, login}` (`expires_at` w sekundach epoki). Każdy dostęp do `localStorage` w `try/catch`.
- Przed każdym zapytaniem do `/rest/v1` gra bierze ważną sesję: gdy do wygaśnięcia zostało mniej niż 60 s, najpierw ją odnawia. Odmowa odnowienia (status 400/401) → sesja lokalna wyczyszczona, gracz wraca do karty logowania z komunikatem „Sesja wygasła — zaloguj się ponownie”.
- Zapytania do `/rest/v1` wysyłają nagłówki `apikey` (klucz publishable) i `Authorization: Bearer <access_token>`.

### 9.4 Baza danych (`supabase/konta.sql`)

Skrypt usuwa dawną tabelę `wyniki` razem z jej zawartością (czysty start) i zakłada:

**`public.gracze`**

| Kolumna | Typ | Ograniczenia |
|---|---|---|
| `id` | `uuid` | klucz główny, `references auth.users(id) on delete cascade` |
| `login` | `text` | `not null`, `unique`, `check (login ~ '^[a-z0-9_]{3,20}$')` |
| `utworzono` | `timestamptz` | `not null`, domyślnie `now()` |

Wiersz zakłada wyzwalacz `after insert on auth.users` (funkcja `security definer`, pusty `search_path`). Login bierze się **z adresu** (część przed `@`, małymi literami), bo adres jest unikalny w Supabase Auth; metadanym od klienta się nie ufa. Adres spoza domeny `gracze.example.com`, metadane `login` niezgodne z adresem albo login łamiący `check` → wyjątek → rejestracja się nie udaje.

**`public.wyniki`**

| Kolumna | Typ | Ograniczenia |
|---|---|---|
| `id` | `bigint` | `generated always as identity`, klucz główny |
| `gracz_id` | `uuid` | `not null`, domyślnie `auth.uid()`, `references public.gracze(id) on delete cascade` |
| `punkty` | `int` | `not null`, od 1 do 397 |
| `utworzono` | `timestamptz` | `not null`, domyślnie `now()` |

Indeksy: `(gracz_id, punkty desc, utworzono asc)` pod „Moje najlepsze”, `(punkty desc, utworzono asc)` pod widok.

**Widok `public.najlepsze_wyniki`** (`security_invoker = true`): najlepszy wynik każdego gracza — `login`, `punkty`, `utworzono`, `gracz_id` — wybrany `distinct on (gracz_id)` po `punkty desc, utworzono asc`.

**Reguły dostępu**

- RLS włączone na `gracze` i `wyniki`.
- Na początku odebranie wszystkich uprawnień rolom `anon` i `authenticated` na obu tabelach, widoku i sekwencji `wyniki_id_seq`.
- `anon` (niezalogowany): **brak jakiegokolwiek dostępu**.
- `authenticated`: `select` na `gracze`, `wyniki` i `najlepsze_wyniki`; `insert` **tylko na kolumnie** `punkty` w `wyniki` (`gracz_id` ustawia baza z `auth.uid()`).
- Polityki: `select` na `gracze` i `wyniki` dla `authenticated` bez warunku; `insert` na `wyniki` dla `authenticated` z warunkiem `gracz_id = (select auth.uid())`.
- Brak uprawnień i polityk na `update` i `delete` — nikt poza właścicielem projektu nie zmieni ani nie usunie wyniku czy gracza.
- **Znane ograniczenie:** zalogowany gracz może wysłać zmyślony wynik (1–397) prosto do API. Akceptowane — wiadomo przynajmniej, czyje to konto.
- **Zapomniane hasło:** gracz nie zresetuje go sam (brak e-maila); właściciel ustawia nowe w panelu Supabase (Authentication → Users).

### 9.5 API

**`konto.js` — obiekt `window.SnakeAccount`**

| Funkcja | Sygnatura | Opis |
|---|---|---|
| `normalizeLogin` | `(raw) => string \| null` | Przycina, zamienia na małe litery, sprawdza regułę z 9.2. Niepoprawny → `null`. |
| `passwordError` | `(password) => null \| 'too_short' \| 'too_long'` | Reguła z 9.2 (długość w znakach i bajtach UTF-8). |
| `loginToEmail` | `(login) => string` | `login + '@gracze.example.com'`. |
| `needsRefresh` | `(session, nowMs) => boolean` | `true`, gdy `expires_at * 1000 - nowMs < 60000`. |
| `authErrorCode` | `(status, body) => string` | Zamienia odpowiedź Supabase Auth na kod: `user_already_exists` → `'login_taken'`, `invalid_credentials` → `'invalid_credentials'`, `weak_password` → `'weak_password'`, inne → `'unknown'`. `body` może być `null`. |
| `signUp` | `(login, password) => Promise<session>` | Rejestracja i od razu sesja; zapisuje ją w `localStorage`. |
| `signIn` | `(login, password) => Promise<session>` | Logowanie; zapisuje sesję. |
| `signOut` | `() => Promise<void>` | Wylogowanie; zawsze czyści sesję lokalną. |
| `currentSession` | `() => session \| null` | Sesja z `localStorage` bez zapytań. |
| `validSession` | `() => Promise<session>` | Sesja gotowa do użycia (odnowiona w razie potrzeby). Odmowa odnowienia → odrzucenie z kodem `'session_expired'`. |

Odrzucone obietnice niosą `Error` z polem `code`: `'login_taken'`, `'invalid_credentials'`, `'weak_password'`, `'session_expired'`, `'network'` (błąd sieci lub przekroczony czas), `'unknown'`.

**`ranking.js` — obiekt `window.SnakeRanking`**

| Funkcja | Sygnatura | Opis |
|---|---|---|
| `isPersonalBest` | `(myTop, score) => boolean` | `true` gdy `score >= 1` i (`myTop` pusta albo `score > myTop[0].punkty`). |
| `fetchGlobalTop` | `(session) => Promise<[{login, punkty}]>` | `GET /rest/v1/najlepsze_wyniki?select=login,punkty&order=punkty.desc,utworzono.asc&limit=10`. |
| `fetchMyTop` | `(session) => Promise<[{punkty, utworzono}]>` | `GET /rest/v1/wyniki?select=punkty,utworzono&gracz_id=eq.<user_id>&order=punkty.desc,utworzono.asc&limit=10`. |
| `submit` | `(session, score) => Promise<void>` | `POST /rest/v1/wyniki` z `{punkty}` i `Prefer: return=minimal`. |

Wspólne dla obu plików: limit czasu 8 s na zapytanie (`AbortController`), status spoza 2xx → odrzucona obietnica. `normalizeLogin`, `passwordError`, `loginToEmail`, `needsRefresh`, `authErrorCode` i `isPersonalBest` to czyste funkcje testowane w `tests.html`.

### 9.6 Warstwa prezentacji

**Karta logowania** (bez sesji)

- Leży nad planszą (HTML na Canvasie); pod nią animowane niebo, przyciemnione. Klawisze kierunku nie uruchamiają gry.
- Dwie zakładki: „Zaloguj” i „Załóż konto”. Pola: „Login” (`autocomplete="username"`), „Hasło” (`current-password` / `new-password`), w „Załóż konto” dodatkowo „Powtórz hasło”. Przycisk: „Zaloguj” / „Załóż konto”, nieaktywny w trakcie zapytania.
- Sprawdzenie przed wysłaniem i komunikaty (dosłownie):
  - niepoprawny login → „Login: 3–20 znaków — litery, cyfry, _”
  - hasło za krótkie → „Hasło musi mieć co najmniej 8 znaków”
  - hasło za długie → „Hasło jest za długie”
  - różne hasła → „Hasła się różnią”
  - `login_taken` → „Ten login jest już zajęty”
  - `invalid_credentials` → „Zły login lub hasło”
  - `weak_password` → „Hasło jest za słabe”
  - `network` → „Brak połączenia — spróbuj ponownie”
  - `unknown` → „Coś poszło nie tak — spróbuj ponownie”
- Po sukcesie karta znika, a fokus wraca do strony; wpisane hasła są czyszczone z pól.
- Gdy fokus jest w karcie, klawisze gry są ignorowane.

**Pasek gracza** (z sesją): nad planszą, obok punktów — „Gracz: <login> · Wyloguj” (przycisk). Wylogowanie w dowolnym momencie: gra w toku przepada, stan wraca do `'ready'`, listy są czyszczone, pojawia się karta logowania.

**Zapis wyniku**

- Gdy gra przechodzi w `'over'` albo `'won'` z wynikiem ≥ 1, wynik zapisuje się automatycznie, raz na grę.
- Status pod planszą: „Zapisywanie…” → „Wynik zapisany” albo „Nie udało się zapisać” z przyciskiem „Spróbuj ponownie” (ponawia zapis tego samego wyniku tej samej gry).
- `session_expired` przy zapisie → karta logowania z komunikatem „Sesja wygasła — zaloguj się ponownie”; wynik tej gry przepada.
- Nowa gra chowa status poprzedniej; spóźniona odpowiedź zapisu poprzedniej gry nie zmienia statusu nowej.
- Rekord osobisty liczony przed zapisem wobec ostatnio pobranej listy „Moje najlepsze” (`isPersonalBest`); gdy lista się nie wczytała — bez linii o rekordzie.

**Listy** (z sesją): dwie kolumny pod planszą (pod sobą na ekranach węższych niż 480 px).

- „Moje najlepsze”: lista numerowana `N pkt · dd.mm.rrrr`. Pusta → „Brak wyników — zagraj pierwszą grę!”.
- „Top 10 wszystkich”: lista numerowana `login — punkty`; wiersz zalogowanego gracza wyróżniony. Pusta → „Brak wyników — bądź pierwszy!”.
- Obie: „Ładowanie…” w trakcie pierwszego pobrania, „Ranking niedostępny” po błędzie. Ładują się po zalogowaniu i po każdym udanym zapisie.
- Treść z bazy wyłącznie przez `textContent`.

## 10. Kryteria akceptacji

### 10.1 Testy automatyczne (`tests.html`)

Każdy punkt to osobna asercja; runner wypisuje nazwę i wynik.

1. `createState` daje węża o długości 3, `status: 'ready'`, punkty 0, interwał 125.
2. Krok bez jedzenia: długość węża się nie zmienia, głowa przesuwa się o wektor kierunku.
3. Krok bez jedzenia: ostatni segment znika z planszy.
4. Zjedzenie jedzenia: długość rośnie dokładnie o 1, punkty rosną o 1.
5. Zjedzenie jedzenia: nowe jedzenie pojawia się na polu wolnym od węża.
6. Zjedzenie jedzenia: interwał maleje o 4 ms.
7. Interwał nie schodzi poniżej 55 ms mimo dalszych zjedzeń.
8. Wyjście poza lewą, prawą, górną i dolną krawędź przenosi głowę na przeciwległą krawędź, a `status` pozostaje `'running'` (cztery przypadki).
9. Zawinięcie przez krawędź nie zmienia długości węża ani punktów.
10. Jedzenie leżące tuż za krawędzią (na przeciwległym brzegu) zostaje zjedzone po zawinięciu — punkty rosną o 1.
11. Zawinięcie na pole zajęte przez własne ciało ustawia `status: 'over'`.
12. Wejście głową w środkowy segment ciała ustawia `status: 'over'`.
13. Wejście na pole zwalniane przez ogon (bez jedzenia) **nie** kończy gry.
14. `enqueueDirection` odrzuca kierunek przeciwny do bieżącego i zwraca `false`.
15. `enqueueDirection` odrzuca kierunek identyczny z bieżącym.
16. Dwa skręty dołożone między krokami są wykonane w dwóch kolejnych krokach, a nie zgubione.
17. `enqueueDirection` nie przyjmuje trzeciego kierunku, gdy kolejka ma już 2 pozycje.
18. Kierunek przeciwny do *ostatniego w kolejce* (nie do bieżącego) jest odrzucany.
19. `spawnFood` z deterministycznym `rng` na planszy niemal pełnej trafia w jedyne wolne pole.
20. `step` na stanie `'ready'`, `'over'` i `'won'` nie zmienia niczego.
21. Zapełnienie planszy ustawia `status: 'won'`.
22. `createSky` daje 40 gwiazdek na planszy, promień 0,6–1,6 px, rytm 2–6 s.
23. `createSky` z tym samym ziarnem `rng` daje te same gwiazdki.
24. `starBrightness` mieści się w 0–1, w ciągu jednego rytmu rozbłyskuje (> 0,95) i przygasa (< 0,2).
25. Pierwsza spadająca gwiazda pojawia się po 4–12 s.
26. Spadająca gwiazda trwa 0,7 s, następna pojawia się po kolejnych 4–12 s.
27. Spadająca gwiazda leci w dół i w prawo, startuje na planszy, smuga ma 60–110 px.
28. `normalizeLogin` przycina i zamienia na małe litery (`'  Lukasz '` → `'lukasz'`, `'Ala_1'` → `'ala_1'`).
29. `normalizeLogin` zwraca `null` dla: `''`, `'ab'`, 21 znaków, `'łukasz'`, `'jan kowalski'`, `'a-b'`.
30. `normalizeLogin` przyjmuje login o długości dokładnie 3 i dokładnie 20 znaków.
31. `passwordError`: 7 znaków → `'too_short'`, 8 znaków → `null`, 72 bajty → `null`, 73+ bajty (np. 37 × `ł`) → `'too_long'`.
32. `loginToEmail('lukasz')` → `'lukasz@gracze.example.com'`.
33. `needsRefresh`: wygaśnięcie za 120 s → `false`, za 59 s → `true`, już wygasła → `true`.
34. `authErrorCode`: `user_already_exists` → `'login_taken'`, `invalid_credentials` → `'invalid_credentials'`, `weak_password` → `'weak_password'`, inny kod albo `body` `null` → `'unknown'`.
35. `isPersonalBest`: pusta lista i wynik 1 → `true`; pusta lista i 0 → `false`; najlepszy 10 i wynik 11 → `true`, 10 → `false`, 9 → `false`.

### 10.2 Weryfikacja ręczna (`index.html`)

1. Otwarcie pliku dwuklikiem z dysku pokazuje planszę i kartę logowania (albo, przy zapamiętanej sesji, ekran startowy) — bez błędów w konsoli.
2. Po zalogowaniu pierwszy klawisz kierunku uruchamia ruch.
3. Wąż reaguje na strzałki i na WSAD.
4. Szybkie wciśnięcie dwóch strzałek pod rząd (np. góra, potem lewo) nie zabija węża.
5. Po zjedzeniu licznik punktów rośnie, a wąż wydłuża się widocznie.
6. Po kilkunastu punktach gra jest wyraźnie szybsza niż na starcie.
7. Dojście do krawędzi planszy przenosi węża na przeciwległą stronę i gra toczy się dalej — bez końca gry i bez utraty punktów.
8. Ugryzienie własnego ciała pokazuje nakładkę końca gry z poprawnym wynikiem — to jedyny sposób na przegraną.
9. Spacja po przegranej startuje nową grę od zera punktów i tempa startowego.
10. Strzałki i spacja nie przewijają strony.
11. Przełączenie na inną kartę na kilkanaście sekund i powrót nie powoduje skokowego przeskoku węża.
12. Bez zapamiętanej sesji widać kartę logowania nad planszą; strzałki nie uruchamiają gry.
13. „Załóż konto” z nowym loginem loguje od razu; nad planszą widać „Gracz: <login> · Wyloguj”.
14. Komunikaty karty: zajęty login → „Ten login jest już zajęty”; złe hasło → „Zły login lub hasło”; różne hasła → „Hasła się różnią”; 7-znakowe hasło → „Hasło musi mieć co najmniej 8 znaków”; login `a-b` → „Login: 3–20 znaków — litery, cyfry, _”.
15. Logowanie loginem pisanym wielkimi literami (`LUKASZ`) działa na konto `lukasz`.
16. F5 po zalogowaniu — gracz nadal zalogowany, listy się wczytują.
17. Przegrana z wynikiem ≥ 1 → „Wynik zapisany”; wynik pojawia się w „Moje najlepsze” i (jeśli się mieści) w „Top 10 wszystkich” z wyróżnionym wierszem.
18. Wynik lepszy od dotychczasowych → na nakładce „Nowy rekord osobisty!”.
19. Drugi gracz (okno prywatne) widzi wynik pierwszego w „Top 10 wszystkich”, ale nie w swoich „Moje najlepsze”; w „Top 10 wszystkich” każdy gracz występuje raz.
20. „Wyloguj” → karta logowania, listy puste, gra w toku przerwana.
21. Brak internetu przy zapisie → „Nie udało się zapisać” i „Spróbuj ponownie”, które po powrocie sieci zapisuje wynik.
22. API: bez tokenu `GET` i `POST` na `/rest/v1/wyniki` są odrzucane; z tokenem `POST` z cudzym `gracz_id` jest odrzucany; `PATCH` i `DELETE` są odrzucane; `punkty: 1000` jest odrzucane.
23. Gra opublikowana na GitHub Pages loguje, zapisuje i pokazuje listy tak samo jak otwarta z dysku.

## 11. Decyzje odrzucone

| Odrzucone | Powód |
|---|---|
| Jeden plik `index.html` ze wszystkim inline | `tests.html` nie ma jak sięgnąć po skrypt inline z innego pliku; `fetch` po `file://` blokuje CORS. |
| Moduły ES | Blokowane przez CORS przy `file://` — psuje uruchamianie dwuklikiem. |
| Koniec gry po uderzeniu w ścianę | Zastąpione zawijaniem planszy: wąż wychodzi poza krawędź i wraca po przeciwnej stronie. |
| Siatka `<div>` zamiast Canvas | Wolniejsza i nietypowa dla gier 2D. |
| Vitest / npm | Łamie założenie „bez instalacji i bez serwera". |
| Biblioteka `supabase-js` z CDN | Dodaje zależność ładowaną z sieci; kilka zapytań REST i odnawianie sesji da się zrobić `fetch`em. |
| Ranking z imieniem wpisywanym ręcznie, bez kont | Zastąpiony kontami graczy 2026-10-13 na prośbę właściciela gry — każdy ma widzieć swoje wyniki. |
| Własna tabela loginów i haseł | Pisanie logowania od zera (haszowanie, sesje, tokeny) to łatwa droga do dziury w bezpieczeństwie; robi to Supabase Auth. |
| Logowanie e-mailem | Właściciel chce loginu; potwierdzanie maili na darmowym planie ma limit kilku wiadomości na godzinę. |
| Gra bez logowania | Decyzja właściciela: grają tylko zalogowani. |
| Wszystkie gry gracza w „Top 10 wszystkich" | Jedna osoba mogłaby zająć całą listę; pokazujemy najlepszy wynik każdego gracza raz. |
| Zachowanie wyników sprzed kont | Nie należą do żadnego konta; właściciel wybrał czysty start. |
| Samodzielny reset hasła | Bez e-maila nie ma kanału do weryfikacji; hasło resetuje właściciel w panelu Supabase. |
| Weryfikacja wyniku po stronie serwera (Edge Function odtwarzająca grę) | Wymaga zapisu całego przebiegu gry i własnego kodu serwerowego; ranking jest dla znajomych. |
| Ranking w `localStorage` | Widoczny tylko na jednym komputerze — nie spełnia celu wspólnej listy. |
