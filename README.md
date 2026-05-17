# sortai

> macOS CLI that walks a folder, OCRs every file with Apple Vision, and writes inferred Finder tags + comments — using a local Ollama model by default, or a cloud LLM with optional PII pseudonymisation.

This is the TypeScript successor to the legacy Python `tagger_*.py` scripts. Native Swift OCR is now delegated to the [`macos-vision`](https://www.npmjs.com/package/macos-vision) package, so there is **no Python, no `swiftc`, no manual setup** — just `npx sortai`.

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
npx sortai

# Dry-run on the Desktop with local Ollama (default mistral-nemo)
npx sortai ~/Desktop --dry-run

# Actually write tags & comments
npx sortai ~/Desktop
```

> The first invocation only writes the config and exits. Edit the file to fit your taxonomy, then re-run.

### Cloud mode (optional)

```bash
# Anthropic Claude, with PII masked locally via pseudonym-mcp before the upstream call
npx sortai ~/Desktop --cloud anthropic --mask --api-key sk-ant-...

# OpenAI without masking (everything in the OCR'd text goes to the provider)
ANTHROPIC_API_KEY=sk-ant-... npx sortai ~/Desktop --cloud openai
```

When `--mask` is set, `sortai` spawns [`pseudonym-mcp`](https://www.npmjs.com/package/pseudonym-mcp) over stdio, runs `mask_text` on the OCR'd text, sends the masked version to the cloud LLM, then `unmask_text` on the returned comment. Tags are taxonomy-bound and never round-trip through the cloud as user values.

> **Pseudonymisation is a defence-in-depth control, not a compliance silver bullet.** Pseudonymised data is still personal data under GDPR Art. 4(5). Read the `pseudonym-mcp` README for the honest limitations.

## How it works

```
folder (recursive walk, .dotfiles + excluded dirs skipped)
   │
   ▼  for each file
macos-vision: ocr(path)         ← Apple Vision OCR (PDF auto-rasterised)
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
   ▼  strict-evidence validation, contextual guards (WS48 / UrzadPracy / CV / YouthRebuild / noOcr)
osascript:
   ├── set tags of (POSIX file ... as alias) to {…}
   └── set comment of … to "…"
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
| `--api-key <key>` | env | API key for the cloud provider |
| `--mask` | off | Pseudonymise OCR via pseudonym-mcp (only with `--cloud`) |
| `--lang en\|pl` | `pl` | Language for pseudonym-mcp regex rules |
| `--exclude <names>` | from config | Comma-separated folder names to skip |
| `--verbose` | off | Extra logs |

Environment variables: `SORTAI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`.

## Configuration

The config file is plain JSON. Sections:

```json
{
  "scan": {
    "folder": "~/Desktop",
    "excludeFolders": ["AI_Sorter", "Dupa"],
    "skipExtensions": [".ds_store", ".sig", ".localized", ".tmp", ".lock", ".pyc"],
    "ocrExtensions": [".pdf", ".png", ".jpg", ".jpeg", ".webp", ".heic"],
    "videoExtensions": [".mov", ".mp4", ".m4v"]
  },
  "ocr": { "maxChars": 4000, "llmMaxChars": 1500 },
  "llm": {
    "provider": "ollama",
    "model": "mistral-nemo",
    "temperature": 0.15,
    "numPredict": 300,
    "ollamaUrl": "http://localhost:11434"
  },
  "mask": { "enabled": false, "lang": "pl" },
  "tags": {
    "allowed":        ["#BNPParibas", "#PKOBP", "…"],
    "strict":         ["#BNPParibas", "#PKOBP", "…"],
    "aliases":        { "#Banki": "#BANKI", "…": "…" },
    "strictEvidence": { "#BNPParibas": ["bnp paribas", "bnpparibas"], "…": ["…"] },
    "pathRules": [
      { "pattern": "BNP.Paribas|BNP_Paribas", "flags": "i", "tags": ["#BNPParibas", "#BANKI"] }
    ],
    "autoTag": "#AI_Sorted"
  },
  "context": "Wlasciciel: Adrian Wolczuk, …"
}
```

- `tags.allowed` — set of tags the LLM is allowed to return; anything else gets dropped.
- `tags.strict` — subset of `allowed`. Strict tags only land on the file if `strictEvidence` keywords are found verbatim in the OCR or filename.
- `tags.aliases` — model-friendly normalisation (`#Banki` → `#BANKI`).
- `tags.pathRules` — regex patterns over `path.replace(/[\\/_-]/g, " ") + " " + ocrText`. Multiple rules can match; results merge.
- `tags.autoTag` — appended to every successfully tagged file (sentinel so you can find "already processed" items in Finder).
- `context` — pinned to the system prompt as background knowledge.

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
git clone https://github.com/woladi/aisort.git
cd aisort
npm install            # macOS only; Linux/Windows needs --ignore-scripts to skip the native build
npm run typecheck
npm run build
node dist/cli.js --help
```

## License

MIT — Adrian Wołczuk
