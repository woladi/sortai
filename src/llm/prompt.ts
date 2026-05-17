import type { Config, LlmRequest } from '../types.js';

export function buildPrompt(req: LlmRequest, cfg: Config, ocrTextForPrompt: string): string {
  const preStr = req.preTags.length > 0 ? req.preTags.join(', ') : 'brak';
  const ocrTrim = ocrTextForPrompt.slice(0, cfg.ocr.llmMaxChars).trim() ||
    '(brak tekstu – plik graficzny/wideo)';

  const strictSet = new Set(cfg.tags.strict);
  const autoTag = cfg.tags.autoTag;
  const safeList = cfg.tags.allowed
    .filter(t => !strictSet.has(t) && t !== autoTag)
    .sort();
  const strictList = [...cfg.tags.strict].sort();

  return [
    'Klasyfikujesz prywatne pliki w języku polskim i angielskim. Bądź OSTROŻNY i PRECYZYJNY.',
    'Zwróć WYŁĄCZNIE poprawny JSON (bez markdown, bez komentarzy):',
    '{"tags": ["#Tag1", "#Tag2"], "comment": "..."}',
    '',
    'PLIK:',
    `- nazwa: ${req.fileName}`,
    `- rozszerzenie: ${req.ext}`,
    `- pre_tags (z nazwy/ścieżki/OCR – ZAWSZE uwzględnij): ${preStr}`,
    `- tekst z dokumentu (OCR):`,
    ocrTrim,
    '',
    'KONTEKST (tylko informacyjnie):',
    cfg.context,
    '',
    'ZASADY TAGOWANIA:',
    '1. Zawsze uwzględnij wszystkie pre_tags.',
    '2. Tagi BEZPIECZNE dodaj jeśli wynikają z OCR lub nazwy.',
    '3. Tagi STRICT dodaj TYLKO gdy słowo kluczowe DOSŁOWNIE jest w OCR/nazwie:',
    "   #BNPParibas → 'BNP Paribas', #KartaKredytowa → 'karta kredytowa',",
    "   #KredytHipoteczny → 'hipoteczn', #KredytGotowkowy → 'gotówkow',",
    "   #RODO → 'RODO' lub 'dane osobowe'. BEZ DOWODU – NIE DODAWAJ.",
    '4. Zwróć 2-5 tagów.',
    '5. Bez tekstu OCR: użyj tylko pre_tags + #Grafika/#Foto.',
    '',
    'ZASADY KOMENTARZA:',
    '- Napisz JEDNO konkretne zdanie po polsku opisujące WYŁĄCZNIE ten plik.',
    '- Komentarz musi wynikać z nazwy pliku lub treści OCR – nie wymyślaj.',
    '- NIE używaj żadnych przykładów z tej instrukcji jako komentarza.',
    "- Format: co to jest + czego dotyczy.",
    "  Dla CV: 'CV Adriana Wołczuka z datą [rok].'",
    "  Dla faktury: 'Faktura od [wystawca] za [usługa].'",
    "  Dla pisma bankowego: 'Pismo BNP Paribas dotyczące [temat].'",
    "  Dla grafiki bez tekstu: 'Grafika: [co widać na podstawie nazwy pliku].'",
    '',
    'TAGI BEZPIECZNE:',
    safeList.join('\n'),
    '',
    'TAGI STRICT (tylko z dowodem w OCR/nazwie):',
    strictList.join('\n'),
    '',
    'RESTRYKCJE:',
    '1. Jeśli tekst OCR ma < 10 słów i nie ma tam imienia Adrian, NIE pisz, że to Twoje CV.',
    '2. Komentarz musi być UNIKALNY. Nie używaj frazy "[rok]". Jeśli nie znasz daty, nie pisz o niej.',
    '3. BĄDŹ SCEPTYCZNY. Lepiej dać 1 tag (#Grafika) niż 5 błędnych.',
  ].join('\n');
}

export function parseJsonSafe(raw: string): unknown {
  const cleaned = raw.trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // fall through
  }
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch {
      return {};
    }
  }
  return {};
}
