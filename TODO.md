# TODO

## `sortai --init` — auto-generate config from your own files

The biggest UX problem right now is the cold-start: user has to manually write `tags.allowed` before the first run without knowing what tags make sense for their collection.

**Planned flow:**

1. `sortai --init ~/Desktop` samples N random files (e.g. 30–50)
2. OCR-s them via Apple Vision (same as normal run)
3. Sends OCR text to LLM with no predefined tag list — "what categories do you see here?"
4. LLM proposes a taxonomy: tag names, aliases, strictEvidence keywords
5. Writes a starter `~/.config/sortai/config.json`
6. User edits it, then runs `sortai ~/Desktop` normally

**Language detection:**
Users often have mixed-language collections (e.g. Polish + English docs). The init mode should detect dominant languages across sampled OCR text and generate bilingual aliases and strictEvidence keywords automatically (e.g. `#Faktura` + alias `#Invoice`, evidence `["faktura", "invoice", " vat "]`).

**LLM quality note:**
Generating a taxonomy is harder than classifying into one. Small local models (mistral-nemo 12B) will produce a rough draft that needs user editing. Larger models (70B+) or cloud (Claude, GPT-4o) do significantly better. The --init mode should either default to cloud or show a clear "this is a draft, please review" warning when using a local model.

---

## Free-form tagging mode

Currently the LLM can only return tags from `tags.allowed` — anything outside the list is hard-filtered in `normalizeTag()`. This makes tagging deterministic and safe but limits discovery.

**Planned:** an opt-in `--free` flag (or config option) where the LLM can invent new tags not in the allowed list. New tags would be collected and shown in a summary at the end so the user can decide whether to add them to config permanently.

Natural next step after `--init` is working well.
