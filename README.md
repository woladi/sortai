# sortai

[![npm](https://img.shields.io/npm/v/@woladi/sortai)](https://www.npmjs.com/package/@woladi/sortai)
[![npm downloads](https://img.shields.io/npm/dm/@woladi/sortai)](https://www.npmjs.com/package/@woladi/sortai)
[![license](https://img.shields.io/npm/l/@woladi/sortai)](./LICENSE)

> macOS CLI that scans a folder, reads every document with **Apple Vision OCR**, and automatically writes **Finder tags** and **Finder comments** — so your files become searchable in Spotlight and browsable by tag in Finder. Runs fully offline by default. Cloud LLMs optional.

## What it does

`sortai` walks a folder recursively, reads the content of PDFs and images using Apple's on-device Vision framework (via [`macos-vision`](https://www.npmjs.com/package/macos-vision)), and uses a language model to infer what the file is about. It then writes that understanding directly into the file's macOS metadata:

- **Finder tags** — coloured labels visible in Finder's sidebar and file listings (e.g. `#Faktura`, `#Umowa`, `#CV`)
- **Finder comment** — a one-sentence description visible in the "Get Info" panel (`⌘I`) and in Spotlight search results

These are standard macOS extended attributes (`xattr`), not a separate database. They travel with the file, work offline, and are indexed by Spotlight immediately.

### How it translates to Finder and Spotlight

After `sortai` runs, you can:

| Action | How |
|--------|-----|
| Browse all invoices | Finder sidebar → click `#Faktura` tag |
| Search by tag in Spotlight | `⌘Space` → type `tag:Faktura` |
| Search by comment in Spotlight | `⌘Space` → type any word from the comment |
| Filter by tag in Finder | Finder → `⌘F` → Add criteria → Tags |
| See description without opening | Select file → `⌘I` → Spotlight Comments |
| Smart folder by tag | Finder → New Smart Folder → Tags is `Faktura` |

Tags and comments are written as binary plist `xattr` entries (`com.apple.metadata:_kMDItemUserTags`, `com.apple.metadata:kMDItemFinderComment`) — the same format Finder itself uses when you manually add a tag. After writing, `sortai` calls `mdimport` to trigger immediate Spotlight reindexing.

## How it works

```
folder (recursive walk, .dotfiles + excluded dirs skipped)
   │
   ▼
dedup: SHA256 over file bytes → identical files → #Duplikat pre-tag
   │
   ▼  for each file
macos-vision → Apple Vision OCR (on-device, no network)
   │  PDF: auto-rasterised, page-bounded (default: first 2 pages)
   │  Images: PNG, JPG, HEIC, WEBP
   │
   ▼
pretag: regex rules over filepath + OCR text → quick pre-tags
   │
   ▼  ≥4 pre-tags AND no OCR text → skip LLM (fast path)
LLM inference: filename + extension + pre-tags + OCR text → tags + comment
   ├── default: local Ollama (mistral-nemo) — 100% offline
   └── --cloud anthropic|openai:
         ├── --mask → pseudonym-mcp masks PII in OCR text (PESEL, names, IBANs…)
         ├── cloud LLM receives masked OCR text
         └── --mask → pseudonym-mcp restores originals in the returned comment
   │
   ▼  strict-evidence validation (e.g. #Bank only if "iban"/"rachunek" appears literally)
   │  per-file 180 s watchdog → fallback to pre-tags if LLM hangs
   │
xattr: write Finder tags + Finder comment as binary plist
mdimport: trigger Spotlight reindex (fire-and-forget)
```

## The OCR engine: Apple Vision via macos-vision

OCR is handled by [`macos-vision`](https://www.npmjs.com/package/macos-vision) — a Node.js package that calls Apple's native **Vision framework** (`VNRecognizeTextRequest`) directly. This means:

- **No network calls for OCR** — recognition happens entirely on your CPU/GPU
- **No Python, no Tesseract, no external binaries** — Vision is built into macOS 12+
- **High accuracy** — the same engine used by Finder's "Look Up" and Live Text
- **PDF support** — PDFs are rasterised page-by-page; `sortai` reads the first 2 pages by default (configurable)
- **Image support** — PNG, JPG, JPEG, WEBP, HEIC

## Privacy model

| Mode | OCR | LLM | What leaves your machine |
|------|-----|-----|--------------------------|
| Default (Ollama) | Apple Vision, on-device | Local Ollama model | Nothing |
| `--cloud anthropic\|openai` | Apple Vision, on-device | Cloud API | Full OCR text of each file |
| `--cloud ... --mask` | Apple Vision, on-device | Cloud API | Masked OCR (`[PESEL:1]`, `[PERSON:1]`, …) |

When `--mask` is set, `sortai` spawns [`pseudonym-mcp`](https://www.npmjs.com/package/pseudonym-mcp) as a local MCP server over stdio. Before each cloud call it runs `mask_text` on the OCR output (replacing real names, PESELs, IBANs, emails etc. with tokens), sends the masked text to the LLM, then runs `unmask_text` on the returned comment to restore the original values.

> **Pseudonymisation is a defence-in-depth control, not a compliance silver bullet.** Pseudonymised data is still personal data under GDPR Art. 4(5). Read the `pseudonym-mcp` README for the honest limitations.

## Requirements

- macOS 12+
- Node.js 20+
- Xcode Command Line Tools — `xcode-select --install` (needed by `macos-vision` to build its Swift binary at install time)
- One of:
  - [Ollama](https://ollama.com) running locally (default) — pull any model, e.g. `ollama pull mistral-nemo`
  - Anthropic or OpenAI API key for cloud mode

## Quick start

```bash
# First run creates ~/.config/sortai/config.json and exits
npx @woladi/sortai

# Dry-run: see what tags would be written, without touching any files
npx @woladi/sortai ~/Desktop --dry-run

# Actually write Finder tags and comments
npx @woladi/sortai ~/Desktop
```

> The first invocation writes the default config and exits. **Edit `~/.config/sortai/config.json`** to match your own tag taxonomy, then re-run.

### Cloud mode (optional)

```bash
# Anthropic Claude — OCR text sent to the API
npx @woladi/sortai ~/Desktop --cloud anthropic --api-key sk-ant-...

# With PII pseudonymisation: only tokens like [PESEL:1] reach the cloud
npx @woladi/sortai ~/Desktop --cloud anthropic --mask --api-key sk-ant-...

# OpenAI
OPENAI_API_KEY=sk-... npx @woladi/sortai ~/Desktop --cloud openai
```

## CLI flags

| Flag | Default | Description |
|------|---------|-------------|
| `<folder>` | from config | Folder to scan recursively |
| `--config <path>` | `~/.config/sortai/config.json` | Alternative config file |
| `--dry-run` | off | Print results without writing tags/comments |
| `--model <name>` | `mistral-nemo` (Ollama) | LLM model name |
| `--ollama-url <url>` | `http://localhost:11434` | Ollama server |
| `--cloud anthropic\|openai` | — | Switch to a cloud LLM |
| `--api-key <key>` | env | API key (`SORTAI_API_KEY` / `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`) |
| `--mask` | off | Pseudonymise OCR text via pseudonym-mcp before cloud call |
| `--lang en\|pl` | `pl` | Language for pseudonym-mcp regex rules |
| `--exclude <names>` | from config | Comma-separated folder names to skip |
| `--limit <n>` | — | Process at most N files |
| `--skip-tagged` | off | Skip files that already carry `cfg.tags.autoTag` (`#AI_Sorted`) |
| `--no-dedup` | off | Skip SHA256 duplicate detection |
| `--verbose` | off | Extra logs |

## Configuration

The first run writes `~/.config/sortai/config.json`. Edit it to fit your taxonomy:

```json
{
  "scan": {
    "folder": "~/Desktop",
    "excludeFolders": ["node_modules", ".git", ".cache"],
    "skipExtensions": [".ds_store", ".sig", ".localized", ".tmp", ".lock", ".pyc"],
    "ocrExtensions": [".pdf", ".png", ".jpg", ".jpeg", ".webp", ".heic"],
    "videoExtensions": [".mov", ".mp4", ".m4v"]
  },
  "ocr": { "maxChars": 4000, "llmMaxChars": 1500, "startPage": 1, "maxPages": 2 },
  "llm": {
    "provider": "ollama",
    "model": "mistral-nemo",
    "temperature": 0.15,
    "numPredict": 300,
    "ollamaUrl": "http://localhost:11434"
  },
  "mask":  { "enabled": false, "lang": "pl" },
  "dedup": { "enabled": true,  "maxFileSizeMB": 200 },
  "tags": {
    "allowed":  ["#Bank", "#Faktura", "#Umowa", "#CV", "#Wniosek", "#AI_Sorted"],
    "strict":   ["#Bank", "#Faktura", "#KartaKredytowa", "#Kredyt", "#RODO"],
    "aliases":  { "#Invoice": "#Faktura", "#Mortgage": "#Kredyt", "#GDPR": "#RODO" },
    "strictEvidence": {
      "#Bank":    ["bank", "iban", "rachunek bankowy"],
      "#Faktura": ["faktura", "invoice", " vat "]
    },
    "pathRules": [
      { "pattern": "\\bbank\\b|iban|rachunek", "flags": "i", "tags": ["#Bank"] },
      { "pattern": "faktura|invoice",          "flags": "i", "tags": ["#Faktura"] }
    ],
    "autoTag": "#AI_Sorted"
  },
  "context": "1-2 sentence description of yourself and ongoing matters — used by the LLM as background."
}
```

Key options:

- **`tags.allowed`** — the full set of tags the LLM may return; anything outside this list is dropped.
- **`tags.strict`** — subset of `allowed`. A strict tag only lands on a file if at least one `strictEvidence` keyword appears verbatim in OCR or filename. Prevents false positives on sensitive categories like `#Bank` or `#Kredyt`.
- **`tags.autoTag`** — appended to every successfully processed file. Used as a sentinel by `--skip-tagged` so you don't re-process files on the next run.
- **`tags.pathRules`** — regex rules matched against the full filepath + OCR text. Matched tags become *pre-tags* that are always included and passed to the LLM as hints.
- **`ocr.startPage` / `ocr.maxPages`** — PDF page range. Default reads pages 1–2; raise `maxPages` for long documents where the key content is deeper.
- **`context`** — one or two sentences about yourself pinned to the LLM system prompt. The model uses this as background when writing comments (e.g. knowing you're a freelancer or a specific sector helps contextualise ambiguous documents).

## Duplicate detection

`sortai` ships two independent duplicate signals:

- **`#Duplikat`** — SHA256 hash over file bytes. Files in a group of ≥2 identical hashes all get this tag. Catches `cp`, sync conflicts, bit-identical copies regardless of filename. Skipped for files > `cfg.dedup.maxFileSizeMB` and for 0-byte files.
- **`#PrawdopodobnaKopia`** — heuristic matched against filename + OCR: detects `copy`, `kopia`, `duplikat`, `(2)` patterns. Catches macOS Finder "Duplicate", "Save As" copies, manual versioning — cases where bytes differ (different mtime, repacked PDF) but the file is logically a copy.

A file can carry both, one, or neither. Use `--no-dedup` to skip hashing on large media libraries.

## Development

```bash
git clone https://github.com/woladi/sortai.git
cd sortai
npm install            # macOS only; on Linux/Windows use --ignore-scripts
npm run typecheck
npm run build
node dist/cli.js --help
```

## License

MIT — Adrian Wołczuk
