# Snake — specyfikacja projektowa

- **Data:** 2026-09-29, rozszerzona o ranking 2026-10-13
- **Status:** zatwierdzona, gotowa do planu implementacji
- **Stos:** HTML5 + Canvas 2D + JavaScript (ES5/ES2015, bez modułów), zero zależności w kodzie; ranking korzysta z zewnętrznej usługi Supabase (sekcja 9)

## 1. Cel i zakres

Klasyczny Snake uruchamiany dwuklikiem na pliku `index.html`, bez serwera, bez `npm install`, bez kroku budowania. Wąż porusza się po siatce, zjada jedzenie, rośnie i przyspiesza. Plansza zawija się na krawędziach — wyjście poza krawędź przenosi głowę na przeciwległą stronę, bez utraty gry. Jedynym końcem gry jest ugryzienie własnego ciała.

**W zakresie:** siatka, ruch, jedzenie, wzrost, punktacja, rosnące tempo, zawijanie planszy na krawędziach, kolizja z własnym ciałem, ekran startowy, ekran końca gry, ekran wygranej, restart, automatyczne testy logiki, wspólny ranking top 10 w Supabase (sekcja 9).

**Poza zakresem:** lokalne rekordy w `localStorage` (przeglądarka pamięta tylko imię gracza), poziomy trudności, przeszkody, bonusowe jedzenie, dźwięk, sterowanie dotykowe, konta i logowanie graczy, ochrona rankingu przed sfałszowanymi wynikami, tryb dwuosobowy, animacje ruchu między komórkami.

## 2. Struktura plików

| Plik | Odpowiedzialność | Zależności |
|---|---|---|
| `snake-logic.js` | Czysta logika gry. Zero DOM, zero Canvas, zero `window` poza jednym eksportem. | brak |
| `ranking.js` | Komunikacja z rankingiem w Supabase i czyste funkcje pomocnicze rankingu. Zero DOM, zero Canvas. | brak (`fetch` przeglądarki) |
| `index.html` | Prezentacja: Canvas, style, pętla czasu, rysowanie, odczyt klawiatury, lista top 10 i formularz imienia. | `snake-logic.js`, `ranking.js` |
| `tests.html` | Runner testów logiki i funkcji pomocniczych rankingu z wypisem wyników w przeglądarce. | `snake-logic.js`, `ranking.js` |
| `tlo-animacja.js` | Animowane niebo: migające gwiazdki i spadające gwiazdy (sekcja 8). Rysuje na podanym kontekście Canvas. | brak |
| `img/` | Grafiki planszy: tło, trzy owoce, głowa węża (sekcja 8). | brak |
| `supabase/ranking.sql` | Skrypt tworzący tabelę rankingu, ograniczenia i reguły dostępu. Uruchamiany ręcznie w SQL Editor Supabase. | brak |

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
- Nakładka na Canvas zależna od `status`:
  - `ready` — „Strzałki lub WSAD — start"
  - `over` — „Koniec gry · Punkty: N" + „Spacja — nowa gra"
  - `won` — „Wygrana! Plansza zapełniona" + „Spacja — nowa gra"
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

## 9. Ranking top 10 (Supabase)

Wspólna lista 10 najlepszych wyników wszystkich graczy, przechowywana w projekcie Supabase `https://bakmagtitoppdzuolyvg.supabase.co`. Gra łączy się z REST API Supabase bezpośrednio przez `fetch` — bez biblioteki `supabase-js`, żeby nie ładować kodu z sieci i zachować brak zależności. Zapytania z pliku otwartego przez `file://` działają, bo Supabase odpowiada nagłówkiem `Access-Control-Allow-Origin: *`.

### 9.1 Tabela `public.wyniki`

| Kolumna | Typ | Ograniczenia |
|---|---|---|
| `id` | `bigint` | `generated always as identity`, klucz główny |
| `imie` | `text` | `not null`, `char_length` od 1 do 20, nie może składać się z samych białych znaków |
| `punkty` | `int` | `not null`, od 1 do 397 (397 = 400 pól − 3 segmenty startowe, czyli wygrana) |
| `utworzono` | `timestamptz` | `not null`, domyślnie `now()` |

Indeks `(punkty desc, utworzono asc)` pod zapytanie o top 10.

### 9.2 Reguły dostępu

- Row Level Security włączone na tabeli.
- Rola `anon` (klucz publishable): uprawnienie `select` na całej tabeli oraz `insert` **tylko na kolumnach** `imie` i `punkty` — gracz nie ustawi sam `id` ani `utworzono`.
- Polityki RLS: `select` dla `anon` bez warunku, `insert` dla `anon` bez warunku (ograniczenia wartości pilnują `check` na kolumnach).
- Brak uprawnień i polityk na `update` i `delete` — wpisów nie da się zmienić ani usunąć kluczem publishable.
- Skrypt zaczyna od odebrania wszystkich uprawnień rolom `anon` i `authenticated`, a potem nadaje tylko powyższe — niezależnie od domyślnych uprawnień projektu.
- Klucz publishable jest wpisany w `ranking.js` i publiczny z założenia. Klucz secret nigdy nie trafia do repozytorium.
- **Znane ograniczenie:** zmyślony wynik (w granicach 1–397) da się wysłać prosto do API z pominięciem gry. Akceptowane — ranking jest dla znajomych, a weryfikacja przebiegu gry wymagałaby serwera.

### 9.3 Kolejność rankingu

Sortowanie: `punkty` malejąco, przy remisie `utworzono` rosnąco (wcześniejszy wynik wyżej). Pobieranie: `GET /rest/v1/wyniki?select=imie,punkty&order=punkty.desc,utworzono.asc&limit=10`.

### 9.4 API `ranking.js`

Jeden obiekt globalny `window.SnakeRanking`:

| Funkcja | Sygnatura | Opis |
|---|---|---|
| `normalizeName` | `(raw) => string \| null` | Przycina białe znaki z obu stron i skraca do 20 znaków liczonych jak w Postgresie (punkty kodowe, `Array.from`). Pusty wynik → `null`. |
| `qualifies` | `(top, score) => boolean` | `true` gdy `score >= 1` i (`top.length < 10` albo `score > top[9].punkty`). Remis z 10. miejscem się nie kwalifikuje, bo przy remisie wygrywa starszy wpis. |
| `fetchTop` | `() => Promise<[{imie, punkty}]>` | Pobiera top 10 wg sekcji 9.3. |
| `submit` | `(name, score) => Promise<void>` | `POST /rest/v1/wyniki` z `{imie, punkty}` i nagłówkiem `Prefer: return=minimal`. Imię przechodzi najpierw przez `normalizeName`; `null` → odrzucona obietnica bez wysyłania. |

- Każde zapytanie wysyła nagłówek `apikey` z kluczem publishable.
- Każde zapytanie ma limit czasu 8 s (`AbortController`). Przekroczenie, błąd sieci albo status HTTP spoza 2xx → odrzucona obietnica.
- `normalizeName` i `qualifies` są czystymi funkcjami bez sieci — testowane w `tests.html`.

### 9.5 Warstwa prezentacji

- Pod planszą sekcja „Top 10”: lista numerowana `miejsce. imię — punkty`. Imiona wstawiane przez `textContent` (nigdy `innerHTML`), żeby wpis z bazy nie mógł wstrzyknąć kodu do strony.
- Lista ładuje się przy otwarciu strony („Ładowanie…”) i ponownie po udanym zapisie. Pusta tabela → „Brak wyników — bądź pierwszy!”.
- Gdy pobranie się nie uda: „Ranking niedostępny”. Gra działa normalnie, formularz zapisu się nie pojawia.
- **Formularz zapisu** pojawia się pod planszą, gdy `status` przechodzi w `'over'` albo `'won'` i `qualifies(top, score)` jest prawdą (wobec ostatnio pobranej listy). Zawiera pole „Twoje imię” (`maxlength=20`) i przycisk „Zapisz”.
  - Pole dostaje fokus automatycznie i jest wstępnie wypełnione imieniem zapamiętanym w `localStorage` (klucz `snake.imie`). Odczyt i zapis `localStorage` w `try/catch` — brak dostępu nie psuje gry.
  - `Enter` w polu albo klik „Zapisz” wysyła wynik. Na czas wysyłania przycisk jest nieaktywny.
  - Sukces: imię zapisane w `localStorage`, formularz znika, fokus wraca do strony, lista się odświeża.
  - Błąd: komunikat „Nie udało się zapisać — spróbuj ponownie”, formularz zostaje.
  - `Escape` zamyka formularz bez zapisu. Każdy wynik można zapisać najwyżej raz.
- Nakładka końca gry przy kwalifikującym się wyniku ma dodatkową linię „Nowy wynik w top 10 — wpisz imię pod planszą”.
- Gdy fokus jest w polu formularza, globalna obsługa klawiszy (kierunki, restart spacją/Enterem) jest ignorowana — wpisywanie imienia nie steruje wężem ani nie restartuje gry.
- Restart gry chowa niewysłany formularz.

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
22. `normalizeName` przycina spacje z obu stron (`'  Ala  '` → `'Ala'`).
23. `normalizeName` zwraca `null` dla pustego napisu i dla samych spacji.
24. `normalizeName` skraca imię dłuższe niż 20 znaków do 20.
25. `normalizeName` liczy znak spoza BMP (np. emoji) jako jeden znak.
26. `qualifies` zwraca `true`, gdy lista ma mniej niż 10 wpisów, a wynik ≥ 1.
27. `qualifies` zwraca `false` dla wyniku 0, nawet przy pustej liście.
28. `qualifies` przy pełnej liście: `true` dla wyniku większego od 10. miejsca, `false` dla równego i mniejszego.

### 10.2 Weryfikacja ręczna (`index.html`)

1. Otwarcie pliku dwuklikiem z dysku pokazuje planszę i ekran startowy — bez błędów w konsoli.
2. Pierwszy klawisz kierunku uruchamia ruch.
3. Wąż reaguje na strzałki i na WSAD.
4. Szybkie wciśnięcie dwóch strzałek pod rząd (np. góra, potem lewo) nie zabija węża.
5. Po zjedzeniu licznik punktów rośnie, a wąż wydłuża się widocznie.
6. Po kilkunastu punktach gra jest wyraźnie szybsza niż na starcie.
7. Dojście do krawędzi planszy przenosi węża na przeciwległą stronę i gra toczy się dalej — bez końca gry i bez utraty punktów.
8. Ugryzienie własnego ciała pokazuje nakładkę końca gry z poprawnym wynikiem — to jedyny sposób na przegraną.
9. Spacja po przegranej startuje nową grę od zera punktów i tempa startowego.
10. Strzałki i spacja nie przewijają strony.
11. Przełączenie na inną kartę na kilkanaście sekund i powrót nie powoduje skokowego przeskoku węża.
12. Po otwarciu strony pod planszą widać listę top 10 (albo „Brak wyników — bądź pierwszy!”).
13. Przegrana z wynikiem mieszczącym się w top 10 pokazuje formularz z fokusem w polu imienia; wpisywanie spacji w imieniu nie restartuje gry, a strzałki nie sterują wężem.
14. Zapis imienia dodaje wynik do listy na właściwym miejscu; po odświeżeniu strony wpis nadal tam jest, a pole imienia przy kolejnej przegranej jest wstępnie wypełnione.
15. Przegrana z wynikiem 0 albo poniżej 10. miejsca nie pokazuje formularza.
16. Po wyłączeniu internetu lista pokazuje „Ranking niedostępny”, a gra działa normalnie.
17. Imię w postaci `<b>test</b>` wyświetla się w liście dosłownie, jako tekst.
18. Próba `PATCH` i `DELETE` na `/rest/v1/wyniki` kluczem publishable nie zmienia danych; `POST` z `punkty: 1000` albo pustym imieniem jest odrzucany przez bazę.
19. Gra opublikowana na GitHub Pages pokazuje i zapisuje ranking tak samo jak otwarta z dysku.

## 11. Decyzje odrzucone

| Odrzucone | Powód |
|---|---|
| Jeden plik `index.html` ze wszystkim inline | `tests.html` nie ma jak sięgnąć po skrypt inline z innego pliku; `fetch` po `file://` blokuje CORS. |
| Moduły ES | Blokowane przez CORS przy `file://` — psuje uruchamianie dwuklikiem. |
| Koniec gry po uderzeniu w ścianę | Zastąpione zawijaniem planszy: wąż wychodzi poza krawędź i wraca po przeciwnej stronie. |
| Siatka `<div>` zamiast Canvas | Wolniejsza i nietypowa dla gier 2D. |
| Vitest / npm | Łamie założenie „bez instalacji i bez serwera". |
| Biblioteka `supabase-js` z CDN | Dodaje zależność ładowaną z sieci; do dwóch zapytań wystarczy `fetch`. |
| Konta i logowanie graczy | Za dużo pracy jak na ranking dla znajomych; imię wpisywane ręcznie wystarcza. |
| Weryfikacja wyniku po stronie serwera (Edge Function odtwarzająca grę) | Wymaga zapisu całego przebiegu gry i własnego kodu serwerowego; ranking jest dla znajomych. |
| Ranking w `localStorage` | Widoczny tylko na jednym komputerze — nie spełnia celu wspólnej listy. |
