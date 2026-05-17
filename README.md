# sortai

[![npm](https://img.shields.io/npm/v/@woladi/sortai)](https://www.npmjs.com/package/@woladi/sortai)
[![npm downloads](https://img.shields.io/npm/dm/@woladi/sortai)](https://www.npmjs.com/package/@woladi/sortai)
[![license](https://img.shields.io/npm/l/@woladi/sortai)](./LICENSE)

> macOS CLI that walks a folder, OCRs every file with Apple Vision, and writes inferred Finder tags + comments — using a local Ollama model by default, or a cloud LLM with optional PII pseudonymisation.

This is the TypeScript successor to the legacy Python `tagger_*.py` scripts. Native Swift OCR is now delegated to the [`macos-vision`](https://www.npmjs.com/package/macos-vision) package, so there is **no Python, no `swiftc`, no manual setup** — just `npx @woladi/sortai`.

## Requirements

- macOS 12+
- Node.js 20+
- Xcode Command Line Tools (`xcode-select --install`) — needed by `macos-vision` to build its Swift binary at install time
- One of:
  - [Ollama](https://ollama.com) running locally (default) — keeps everything offline
  - Anthropic or OpenAI API key — for cloud LLM with optional `--mask`

## Quick start

```bash
# First run creates ~/.config/sortai/config.json with the default taxonomy
npx @woladi/sortai

# Dry-run on the Desktop with local Ollama (default mistral-nemo)
npx @woladi/sortai ~/Desktop --dry-run

# Actually write tags & comments
npx @woladi/sortai ~/Desktop
```

> The first invocation only writes the config and exits. Edit the file to fit your taxonomy, then re-run.

### Cloud mode (optional)

```bash
# Anthropic Claude, with PII masked locally via pseudonym-mcp before the upstream call
npx @woladi/sortai ~/Desktop --cloud anthropic --mask --api-key sk-ant-...

# OpenAI without masking (everything in the OCR'd text goes to the provider)
ANTHROPIC_API_KEY=sk-ant-... npx @woladi/sortai ~/Desktop --cloud openai
```

When `--mask` is set, `sortai` spawns [`pseudonym-mcp`](https://www.npmjs.com/package/pseudonym-mcp) over stdio, runs `mask_text` on the OCR'd text, sends the masked version to the cloud LLM, then `unmask_text` on the returned comment. Tags are taxonomy-bound and never round-trip through the cloud as user values.

> **Pseudonymisation is a defence-in-depth control, not a compliance silver bullet.** Pseudonymised data is still personal data under GDPR Art. 4(5). Read the `pseudonym-mcp` README for the honest limitations.

## How it works

```
folder (recursive walk, .dotfiles + excluded dirs skipped)
   │
   ▼
dedup.ts: SHA256 over file bytes ← byte-identical groups → #Duplikat preTag
   │
   ▼  for each file
macos-vision: ocr(path, { startPage, maxPages })
                                ← Apple Vision OCR (PDF auto-rasterised, page-bounded)
   │
   ▼
pretag.ts: PATH_TAG_RULES        ← regex rules from config
   │
   ▼  ≥4 pre-tags AND no OCR text → skip LLM (fast path)
LLM tag/comment inference:
   ├── default: local Ollama (mistral-nemo) — fully offline
   └── --cloud anthropic|openai:
         ├── --mask → pseudonym-mcp.mask_text(ocr)
         ├── cloud LLM gets masked OCR text
         └── --mask → pseudonym-mcp.unmask_text(comment)
   │
   ▼  strict-evidence validation, contextual guards (#CV vs financial, noOcr → no strict)
   │  per-file 180s watchdog → fallback if a single call hangs
macos.ts: xattr -wx + binary plist
   ├── com.apple.metadata:_kMDItemUserTags    (Finder tags)
   └── com.apple.metadata:kMDItemFinderComment (Finder comment)
   ├── mdimport <file>                         (Spotlight reindex, fire-and-forget)
```

> Why not `osascript` + Finder `set tags`? It returns `-10006` on macOS 26+ (Tahoe). `xattr` + a binary plist is the same path the Python tagger used and works on every macOS version.

## CLI flags

| Flag | Default | Description |
|------|---------|-------------|
| `<folder>` | from config | Folder to scan recursively |
| `--config <path>` | `~/.config/sortai/config.json` | Alternative config file |
| `--dry-run` | off | Print results without writing tags/comments |
| `--model <name>` | `mistral-nemo` (Ollama) | LLM model name |
| `--ollama-url <url>` | `http://localhost:11434` | Ollama server |
| `--cloud anthropic\|openai` | — | Switch to a cloud LLM |
| `--api-key <key>` | env | API key for the cloud provider |
| `--mask` | off | Pseudonymise OCR via pseudonym-mcp (only with `--cloud`) |
| `--lang en\|pl` | `pl` | Language for pseudonym-mcp regex rules |
| `--exclude <names>` | from config | Comma-separated folder names to skip |
| `--limit <n>` | — | Process at most N files |
| `--skip-tagged` | off | Skip files that already carry `cfg.tags.autoTag` (`#AI_Sorted` by default) |
| `--no-dedup` | off | Skip SHA256 hashing pre-pass (no hash-based `#Duplikat`) |
| `--verbose` | off | Extra logs |

Environment variables: `SORTAI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`.

## Configuration

The default taxonomy that ships in `defaults.ts` is intentionally generic (`#Bank`, `#Faktura`, `#Umowa`, `#CV`, `#Wniosek`, `#Screenshot`, …) and is meant as a starting point. **Edit `~/.config/sortai/config.json` after the first run** to match your own categories — vendors, projects, clients, recurring matters.

The config file is plain JSON. Sections:

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
  "context": "1-2 sentence description of yourself and ongoing matters — used by the LLM as background. Example: 'Self-employed designer in Warsaw, clients AcmeCorp + BetaInc.'"
}
```

- `scan.folder` / `scan.excludeFolders` / `scan.skipExtensions` — what to walk, skip, and ignore by extension.
- `ocr.maxChars` / `ocr.llmMaxChars` — cap on OCR text fed to the post-filter and to the LLM prompt.
- `ocr.startPage` / `ocr.maxPages` — PDF page range (1-based). Default `1` / `2` only OCRs the first two pages; raise it for content-heavy documents.
- `mask` — pseudonymisation toggle for `--cloud` (no-op without `--cloud`).
- `dedup` — SHA256 duplicate detection (see below).
- `tags.allowed` — set of tags the LLM is allowed to return; anything else is dropped.
- `tags.strict` — subset of `allowed`. Strict tags only land on the file if at least one `strictEvidence` keyword appears verbatim in the OCR or filename.
- `tags.aliases` — model-friendly normalisation (`#Invoice` → `#Faktura`).
- `tags.pathRules` — regex patterns over `path.replace(/[\\/_-]/g, " ") + " " + ocrText`. Multiple rules can match; results merge into `preTags`.
- `tags.autoTag` — appended to every successfully tagged file (sentinel so you can find "already processed" items in Finder and `--skip-tagged` works).
- `context` — pinned to the system prompt as background knowledge. **Edit this** — the default is a placeholder.

## Duplicate detection

`sortai` ships two independent duplicate signals:

- **`#Duplikat`** — SHA256 over file bytes, computed for every file before the main pipeline. Files in a group of ≥2 identical hashes all get this tag. Catches `cp foo bar`, sync conflicts, etc. — anything bit-identical regardless of name. Skipped for files > `cfg.dedup.maxFileSizeMB` (200 by default) and 0-byte files.
- **`#PrawdopodobnaKopia`** — heuristic over filename + OCR: matches `copy`, `kopia`, `duplikat`, `(N)` in parentheses. Catches macOS Finder "Duplicate", Preview "Save As" copies, manual versioning — where the bytes differ (different `mtime`, repacked PDF, embedded timestamp) but the file is logically a copy.

A file can carry both, one, or neither. Skip the hash pre-pass with `--no-dedup` if it's too slow on huge media libraries.

## What about Markdown export?

`sortai` is the *tagger*. If you want image/PDF → Markdown, use `macos-vision` directly:

```bash
npx macos-vision --markdown invoice.pdf -o invoice.md
```

That's the same Apple Vision + Ollama pipeline (VisionScribe), without the file-tagging layer.

## Privacy

- **Default (Ollama)**: nothing leaves your machine.
- **`--cloud` without `--mask`**: the *full* OCR text of every scanned file is sent to your chosen provider. Use only when you trust the provider with the documents.
- **`--cloud --mask`**: the OCR text is masked locally first; tokens like `[PERSON:1]`, `[PESEL:1]` flow to the cloud instead of literals. Structure, dates, amounts, and any PII the regex/LLM detector misses still travel. See [`pseudonym-mcp`](https://www.npmjs.com/package/pseudonym-mcp) for the full caveats.
- File metadata is written via `osascript` (Apple Events). `sortai` makes no other network calls beyond your chosen LLM provider.

## Development

```bash
git clone https://github.com/woladi/sortai.git
cd sortai
npm install            # macOS only; Linux/Windows needs --ignore-scripts to skip the native build
npm run typecheck
npm run build
node dist/cli.js --help
```

## License

MIT — Adrian Wołczuk
