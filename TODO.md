# TODO — sortai

Lista rzeczy zaplanowanych po 0.2.0. Aktualizuj w trakcie pracy; usuń odhaczone.

---

## i18n / tłumaczenia

Wszystkie komunikaty CLI, prompty wizarda i progress-logi są obecnie
**hardkodowane po polsku** (DX preferencja maintainera). README, klucze configu
i kod źródłowy są po angielsku. Brak jakiegokolwiek scaffoldingu i18n.

`mask.lang: 'pl' | 'en'` w configu dotyczy **wyłącznie** regułek `pseudonym-mcp`
(wybór regex do maskowania PESEL/IBAN), nie ma wpływu na język UI.

### Co trzeba zrobić, żeby dać opcję angielską

1. **Wyodrębnić stringi do `src/i18n/`**:
   - `src/i18n/pl.ts`, `src/i18n/en.ts` z obiektem typu `Messages` (klucz →
     string lub funkcja `(args) => string` dla tych z interpolacją).
   - Obecnie polski tekst jest w: `src/cli.ts` (opisy flag/komend),
     wszystkie pliki w `src/wizard/`, wszystkie `src/commands/*.ts` (progress
     + summary outputy), `src/llm/index.ts` (komunikaty fallback),
     `src/organize/*.ts`, `src/mask.ts`. Łącznie ~150-200 literałów.
2. **Schema configu**: dodać `ui.lang: 'pl' | 'en'` w `src/config.ts`,
   default `'pl'` żeby nie zmieniać UX istniejącym userom.
3. **Wizard**: pytanie o język UI jako pierwsze (przed trybem), zapis do
   configu razem z resztą.
4. **Helper `t(key, args?)`** który czyta `cfg.ui.lang` z lokalnego
   kontekstu — najprościej pass-through przez parametr albo singleton
   inicjowany w `loadConfig`.
5. **Auto-detekcja `LANG`/`LC_ALL`** jako fallback gdy config jeszcze nie
   istnieje (wizard pre-config) — `LANG=pl_PL.UTF-8` → polski, inaczej angielski.

### Decyzje do podjęcia

- Czy język UI przekładać też na `pseudonym-mcp`? Obecnie `mask.lang` jest
  osobny i może zostać.
- Czy tłumaczyć wpisy w `defaults.ts` (`DEFAULT_ALLOWED_TAGS` = `#Faktura`,
  `#Bank` itd.)? Te tagi i tak trafiają na pliki — user EN-only może chcieć
  `#Invoice`, `#Bank`. Sugestia: zostawić polskie taxa jako default,
  ale wizard EN podsuwa zlocalizowaną default taxonomy.
- Skala: tłumaczenie + i18n helpery to ~4-8 godzin roboty. Czy warto przed
  rozprzestrzenieniem narzędzia (obecnie jeden user)? Albo dopiero po
  pierwszym zewnętrznym issue z prośbą o EN UI?

---

## Znane ryzyka

1. **mdls parser** w [src/organize/read-tags.ts:11](src/organize/read-tags.ts#L11) —
   regex wyciąga zawartość cudzysłowów z wyjścia `mdls -raw`. Tagi z sortai
   są bezpieczne (kontrolowany shape), ale pliki ręcznie otagowane przez
   usera w Finderze mogą mieć `"` lub `\n` w nazwie i wtedy parser zwróci
   śmieci. Warto sanity-check na realnych plikach z Findera.

2. **Konflikty nazw przy organize** — `dedupName` w
   [src/organize/plan.ts:23](src/organize/plan.ts#L23) sprawdza `taken`
   (rezerwacja w planie) i `existsSync` (kolizje z FS). Edge case: dwa pliki
   o tej samej nazwie w różnych podkatalogach, oba z tym samym tagiem →
   drugi dostaje `_2`. Może być niespodzianką jeśli user oczekuje zachowania
   struktury katalogów. Rozważyć opcję `flatten=false` lub strategię `nested`.

3. **`fs.rename` cross-filesystem** w [src/organize/move.ts:14](src/organize/move.ts#L14) —
   fallback EXDEV → copy+unlink jest, ale przy dużych plikach kopiowanie
   nie pokazuje progresu. Dodać `ora` spinner per-plik z rozmiarem.

4. **Wizard inquirer Ctrl-C** — łapię w [src/cli.ts:62](src/cli.ts#L62) przez
   `name === 'ExitPromptError'` lub message `'force closed'`. Inquirer 8.4
   czasem rzuca `AbortError` zamiast tego — warto przetestować Ctrl-C w
   środku każdego prompta i potwierdzić że nie zostawia śmieci (np. partial
   config).

5. **Wybór "discovery" w wizardzie** — pokazuje taksonomię i pyta o zapis.
   Jeśli user odpowie "tak" zapisujemy config (z taksonomią), ale bez
   ustawienia trybu organize ani uruchomienia tagowania. To celowe
   (discovery = tylko eksploracja), ale warto sprawdzić
   [src/wizard/index.ts:283-289](src/wizard/index.ts#L283) czy flow jest OK.

6. **TagDiscovery zlicza tylko w pamięci** jednego runa. Nie zapisuje się
   do configu automatycznie — user musi sam skopiować z output do
   `tags.allowed`. Patrz follow-up: `sortai init --merge-discovered`.

7. **Domyślne modele cloud** w [src/wizard/index.ts:30-39](src/wizard/index.ts#L30) —
   `claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`,
   `gpt-4o`, `gpt-4o-mini`. Sprawdzić że te ID-ki są ważne w API
   Anthropic/OpenAI co kilka miesięcy.

---

## Follow-up (features / poprawki)

- **`sortai init --merge-discovered`** — wczytanie discovery z poprzedniego
  runa i dodanie do `tags.allowed`. Domyka pętlę free-form: user widzi nowe
  tagi w summary → jedna komenda promuje je do allowed.
- **`organize --multi-tag symlink|copy`** — obecnie wspierany tylko
  `primary` (plik trafia do folderu pierwszego tagu z priority). Niektórzy
  userzy chcą widzieć plik w *każdym* matching folderze przez symlinki
  albo kopie.
- **Progress per-file dla dużych plików** w `executeMove` — ora spinner
  z rozmiarem podczas copy+unlink na cross-FS.
- **Snapshot tests** dla `buildPrompt` i `buildTaxonomyPrompt`
  (`toMatchSnapshot`) — żeby zmiany w promptach były widoczne w PR-ach.
- **Refactor `wizard/index.ts`** — wydzielić `ask*` do `wizard/prompts.ts`
  żeby dało się je unit-testować przez `@inquirer/testing` (pattern
  z `tests/inquirer-prompts.test.ts`).
