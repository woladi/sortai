# Handoff: sortai 0.2.0 — wizard + organize + free-form

Branch: `claude/improve-cli-ux-TUGcd` (commits `3e0880b`, `48e7d06`).
Pisane w środowisku Linux bez macOS/Ollamy — wszystkie macOS-specific ścieżki
wymagają weryfikacji na Twojej maszynie.

---

## Co się zmieniło względem 0.1.x

CLI rozbity na subkomendy (commander; `tag` to `isDefault`):

```
sortai init [folder]      interaktywny wizard (NOWE)
sortai tag  [folder]      OCR + LLM → Finder tags (akcja domyślna)
sortai organize [folder]  przenoszenie do folderów po tagach (NOWE)
sortai clear [folder]     czyszczenie xattr (z flagi → komenda)
sortai sample [folder]    dry-run pipeline'u na N losowych plikach (NOWE)
```

`sortai` bez argumentów lub `sortai tag` bez configu auto-uruchamia wizard.

Nowy wizard (`src/wizard/`) zadaje pytania o tryb, providera, model
(z auto-detect Ollamy), kontekst, free-form; potem **samplinguje N plików,
OCR-uje, wykrywa język (PL/EN po stopwordach) i prosi LLM o taksonomię**
8–15 kategorii z aliasami i strict_evidence. Pętla refinement: edycja per-tag,
ręczne dodanie, `$EDITOR` JSON, regeneracja z hintem, podgląd "jak otaguje
próbkę" (dry-run pipeline'u in-memory). Zapis configu z backupem `.bak.<ts>`.

Tryb `organize` czyta `kMDItemUserTags` przez `mdls`, buduje plan
(priority + fallback first-non-meta), domyślnie dry-run, `--apply` żeby
wykonać. Konflikty nazw → sufiksy `_2 _3`. `fs.rename` z EXDEV fallbackiem.

Free-form (`--free` / `tags.freeForm`): LLM może proponować nowe tagi;
zbierane w `TagDiscovery`, pokazane w podsumowaniu runa.

Backward compat: stare configi (bez `organize`, bez `tags.freeForm`) ładują
się przez zod `.default()` — przetestowane na Linuxie z fixture configiem.

---

## Setup po pull-u

```bash
npm install                       # zbuduje macos-vision Swift binary
npm run typecheck                 # tsc --noEmit — musi przejść
npm test                          # vitest run — 56 testów, ~1s
npm run build                     # dist/
node dist/cli.js --help           # smoke test routera
```

`@inquirer/prompts` (runtime) i `vitest` + `@inquirer/testing` (dev) są nowe.
`package-lock.json` zaktualizowany.

---

## Co MUSISZ zweryfikować na macOS (luki testowe Linuxa)

| Komponent | Plik | Jak sprawdzić |
|---|---|---|
| Apple Vision OCR | `src/ocr.ts` | `sortai sample ~/Desktop -n 3` — w output liczba "words" >0 dla PDF/PNG |
| Czytanie xattr przez `mdls` | `src/organize/read-tags.ts` | Otaguj plik ręcznie w Finderze, potem `sortai organize ~/folder --dry-run` — plan powinien rozpoznać tag |
| Zapis xattr (Finder tags + comment) | `src/macos.ts` (bez zmian od 0.1.6) | `sortai tag ~/folder` → `xattr -l plik.pdf` pokazuje `_kMDItemUserTags` i `kMDItemFinderComment` |
| `executeMove` + `mdimport` | `src/organize/move.ts` | `sortai organize ~/test --apply`, potem `mdfind "tag:Faktura"` — przesunięty plik powinien się indeksować w nowej lokalizacji |
| Ollama probe | `src/llm/ollama-detect.ts` | `sortai init` → krok provider → wybór Ollama; powinno wylistować zainstalowane modele z rozmiarami |
| Pseudonym-mcp (`--mask`) | `src/mask.ts` (bez zmian) | `sortai tag --cloud anthropic --mask --dry-run` na pliku z PESELem; w logach powinien być `[masked]` |
| Wizard E2E | cały `src/wizard/` | `./tests/e2e/wizard.expect ~/test-fixtures` — wymaga `expect` (`brew install expect`) |

---

## Smoke test (5 minut)

```bash
# 0. Setup fixtures
mkdir -p /tmp/sortai-smoke
cp ~/sciezka/do/jakiejs-faktury.pdf /tmp/sortai-smoke/
cp ~/sciezka/do/jakiegos-cv.pdf     /tmp/sortai-smoke/

# 1. Wizard — happy path Ollama
ollama serve &                                     # jeśli nie chodzi
ollama pull mistral-nemo                           # jeśli brak
sortai init /tmp/sortai-smoke                      # przejdź wizard

# 2. Tag w dry-run (sprawdź czy LLM odpowiada sensownie)
sortai tag /tmp/sortai-smoke --dry-run

# 3. Tag na żywo i weryfikacja xattr
sortai tag /tmp/sortai-smoke
xattr -l /tmp/sortai-smoke/jakas-faktura.pdf       # powinien być _kMDItemUserTags
mdls -name kMDItemUserTags /tmp/sortai-smoke/*.pdf

# 4. Organize plan
sortai organize /tmp/sortai-smoke --dry-run        # powinien zobaczyć tagi z kroku 3

# 5. Organize apply
sortai organize /tmp/sortai-smoke --apply --target /tmp/sortai-sorted
ls -R /tmp/sortai-sorted

# 6. Spotlight reindex
mdfind -onlyin /tmp/sortai-sorted "tag:Faktura"

# 7. Clear żeby wrócić do stanu początkowego
sortai clear /tmp/sortai-smoke
sortai clear /tmp/sortai-sorted
```

---

## Znane ryzyka / na co zwrócić uwagę

1. **mdls parser** w `src/organize/read-tags.ts:11` — regex `"((?:[^"\\]|\\.)*?)"`
   wyciąga zawartość cudzysłowów z wyjścia `mdls -raw`. macOS format to
   `("#Faktura\n0", "#Bank\n0")` — odcinamy `\n0` przez `.split('\n')[0]`.
   Jeśli ktoś ma tag zawierający `"` lub `\n` w nazwie — pęknie. Tagi z
   sortai są bezpieczne (regex `/^#[A-Za-z0-9_-]+$/`), ale pliki ręcznie
   otagowane przez usera mogą być dziwne. Warto sanity-check na realnych
   plikach z Findera.

2. **Konflikty nazw przy organize** — `dedupName` w `src/organize/plan.ts:23`
   sprawdza i `taken` (rezerwacja w planie) i `existsSync` (kolizje z FS).
   Edge case: dwa pliki o tej samej nazwie w różnych podkatalogach, oba
   z tym samym tagiem — drugi dostaje `_2`. To może być niespodzianką jeśli
   user się spodziewa zachowania struktury katalogów. Może warto dodać
   opcję `flatten=false`.

3. **`fs.rename` cross-filesystem** — w `src/organize/move.ts:14` mam fallback
   EXDEV → copy+unlink. Przy dużych plikach kopiowanie nie pokazuje progresu;
   jeśli to problem, dodać `ora` spinner per-plik z rozmiarem.

4. **Wizard inquirer Ctrl-C** — łapię w `src/cli.ts:62` przez `name === 'ExitPromptError'`
   lub message `'force closed'`. Inquirer 8.4 czasem rzuca `AbortError`
   zamiast tego — warto przetestować Ctrl-C w środku wizardu i potwierdzić
   że nie zostawia śmieci.

5. **Wybór "discovery" w wizardzie** — pokazuje taksonomię i pyta o zapis.
   Jeśli user odpowie "tak" zapisujemy config (z taksonomią), ale bez
   ustawienia trybu organize ani uruchomienia tagowania. To celowe (discovery
   = tylko eksploracja), ale warto przeczytać `src/wizard/index.ts:283-289`
   żeby potwierdzić że flow jest OK.

6. **Free-form i strict** — w `src/tags.ts:9` regex `/^#[A-Za-z0-9_-]+$/` nie
   dopuszcza polskich znaków (ą, ć, ł…). To celowe (kompatybilność z Finder
   xattr), ale jeśli LLM zaproponuje `#Płatność` to zostanie odrzucone.
   Można rozluźnić jeśli chcesz polskie tagi.

7. **TagDiscovery** zlicza tylko w pamięci jednego runa. Nie zapisuje się
   do configu automatycznie — user musi sam skopiować z output do
   `tags.allowed`. Można dodać `sortai init --merge-discovered` jeśli będzie
   potrzeba (zaplanowane w wizardzie ale nie zaimplementowane).

8. **Domyślne modele cloud** w `src/wizard/index.ts:30-39` — `claude-opus-4-7`,
   `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`, `gpt-4o`, `gpt-4o-mini`.
   Sprawdź że te ID-ki nadal są ważne w API Anthropic/OpenAI w dniu publikacji.

---

## Mapa plików (nowe / zmienione)

```
src/
├── cli.ts                        ZMIENIONE: router subkomend
├── config.ts                     ZMIENIONE: +saveConfig, +configExists, +OrganizeSchema
├── defaults.ts                   ZMIENIONE: +DEFAULT_ORGANIZE, +freeForm
├── tags.ts                       ZMIENIONE: +freeForm, +TagDiscovery, +isMetaTag
├── types.ts                      ZMIENIONE: +OrganizeConfig, +Taxonomy, +SampledFile, ...
├── commands/                     NOWE
│   ├── clear.ts                  wyciągnięte ze starego cli.ts
│   ├── init.ts                   wizard + auto-run tag/organize
│   ├── organize.ts               TODO.md #2
│   ├── sample.ts                 dry-run pipeline'u
│   └── tag.ts                    wyciągnięte ze starego cli.ts + auto-init
├── llm/
│   ├── index.ts                  ZMIENIONE: +inferTaxonomy, +freeForm
│   ├── ollama-detect.ts          NOWE
│   └── prompt.ts                 ZMIENIONE: +buildTaxonomyPrompt
├── organize/                     NOWE
│   ├── move.ts                   fs.rename + EXDEV fallback + mdimport
│   ├── plan.ts                   plan przenoszeń, priority, dedupName, conflict suffixes
│   └── read-tags.ts              mdls → string[]
└── wizard/                       NOWE
    ├── index.ts                  orkiestracja (askMode, askProvider, ...)
    ├── languages.ts              detekcja PL/EN po stopwordach
    ├── refine.ts                 pętla edycji + tabela taksonomii
    ├── sample.ts                 pickSampleFiles + ocrSamples
    └── taxonomy.ts               applyTaxonomyToConfig + roundtrip

tests/                            NOWE
├── e2e/wizard.expect             E2E przez prawdziwe PTY
├── inquirer-prompts.test.ts      wzorzec @inquirer/testing
├── llm/prompt.test.ts            parseJsonSafe + buildTaxonomyPrompt
├── organize/plan.test.ts         vi.mock(readMacosTags) + tmpdir fixtures
├── tags.test.ts                  normalize / merge / strict / discovery
└── wizard/
    ├── languages.test.ts
    └── taxonomy.test.ts
```

Bez zmian: `src/ocr.ts`, `src/macos.ts`, `src/mask.ts`, `src/walker.ts`,
`src/pretag.ts`, `src/dedup.ts`, `src/llm/local.ts`, `src/llm/cloud.ts`.

---

## Co MOGĘ zrobić w follow-up (jeśli zlecisz)

- `sortai init --merge-discovered` — wczytanie discovery z poprzedniego runa
  i dodanie do `tags.allowed`.
- `organize --multi-tag symlink|copy` — obecnie wspieram tylko `primary`.
- Progress per-file dla dużych plików w `executeMove` (ora spinner).
- Rozluźnienie regex tagu w `normalizeTag` żeby dopuścić polskie znaki.
- Snapshot tests dla `buildPrompt` i `buildTaxonomyPrompt` (toMatchSnapshot).
- Refactor `wizard/index.ts` — wydzielić `ask*` do `wizard/prompts.ts`
  żeby dało się je unit-testować przez `@inquirer/testing`.
