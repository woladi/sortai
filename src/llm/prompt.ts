import type { Config, LlmRequest, SampledFile, LanguageCode } from '../types.js';

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
    '3. Tagi STRICT dodaj TYLKO gdy słowo kluczowe DOSŁOWNIE występuje w OCR/nazwie',
    '   (lista evidence keywords per-tag jest w configu w polu strictEvidence).',
    '   BEZ DOWODU W TEKŚCIE – NIE DODAWAJ tagu strict.',
    '4. Zwróć 2-5 tagów.',
    '5. Bez tekstu OCR: użyj tylko pre_tags + #Grafika/#Foto.',
    '',
    'ZASADY KOMENTARZA:',
    '- Napisz JEDNO konkretne zdanie po polsku opisujące WYŁĄCZNIE ten plik.',
    '- Komentarz musi wynikać z nazwy pliku lub treści OCR – nie wymyślaj.',
    '- NIE używaj żadnych przykładów z tej instrukcji jako komentarza.',
    "- Format: co to jest + czego dotyczy.",
    "  Dla CV: 'CV z [rok] – [krótki kontekst, np. branża].'",
    "  Dla faktury: 'Faktura od [wystawca] za [usługa].'",
    "  Dla pisma z banku: 'Pismo z [bank] dotyczące [temat].'",
    "  Dla grafiki bez tekstu: 'Grafika: [co widać na podstawie nazwy pliku].'",
    '',
    'TAGI BEZPIECZNE:',
    safeList.join('\n'),
    '',
    'TAGI STRICT (tylko z dowodem w OCR/nazwie):',
    strictList.join('\n'),
    '',
    'RESTRYKCJE:',
    '1. Jeśli OCR ma < 10 słów, użyj #Grafika i krótkiego komentarza opartego o nazwę pliku – nie zgaduj treści dokumentu.',
    '2. Komentarz musi być UNIKALNY. Nie używaj frazy "[rok]". Jeśli nie znasz daty, nie pisz o niej.',
    '3. BĄDŹ SCEPTYCZNY. Lepiej dać 1 tag (#Grafika) niż 5 błędnych.',
  ].join('\n');
}

export function buildTaxonomyPrompt(
  samples: SampledFile[],
  langs: LanguageCode[],
  userContext: string,
  hint?: string,
): string {
  const samplesBlock = samples
    .map((s, i) => {
      const trimmed = s.ocrText.slice(0, 600).trim() || '(brak tekstu OCR – plik graficzny/wideo)';
      return `--- Plik ${i + 1} ---\nnazwa: ${s.name}\nrozszerzenie: ${s.ext}\nOCR:\n${trimmed}`;
    })
    .join('\n\n');

  const langLabel = langs.length === 0 ? 'nieznany' : langs.join(' + ');

  return [
    'Jesteś asystentem budującym taksonomię tagów Findera dla prywatnej kolekcji plików.',
    'Poniżej znajdziesz próbki plików (nazwa + fragment OCR). Zaproponuj 8-15 ZRÓŻNICOWANYCH kategorii.',
    '',
    `Wykryte języki: ${langLabel}`,
    `Kontekst użytkownika: ${userContext || '(brak)'}`,
    hint ? `Dodatkowa wskazówka: ${hint}` : '',
    '',
    'Dla każdej kategorii podaj:',
    '- name: nazwa tagu w formacie #PascalCase (jedno słowo, bez spacji, np. #Faktura)',
    '- description: jedno zdanie po polsku',
    '- aliases: tablica nazw w innych wykrytych językach (np. ["#Invoice"])',
    '- strict_evidence: 3-5 słów-dowodów które MUSZĄ pojawić się w OCR/nazwie żeby tag był nałożony (dla kategorii wrażliwych: finansowych, prawnych, zdrowotnych)',
    '- is_strict: true tylko dla wrażliwych kategorii (Bank, Faktura, RODO, Zdrowie, Podatki, KartaKredytowa, Kredyt)',
    '- examples: tablica nazw plików z próbki które pasują do tej kategorii',
    '',
    'Zwróć WYŁĄCZNIE JSON w formacie:',
    '{"categories": [{"name":"#X","description":"...","aliases":["#Y"],"strict_evidence":["..."],"is_strict":false,"examples":["..."]}], "summary":"jedno zdanie podsumowania"}',
    '',
    'PRÓBKI:',
    samplesBlock,
  ].filter(Boolean).join('\n');
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
