import type { Config, OrganizeConfig } from './types.js';

export const DEFAULT_ALLOWED_TAGS = [
  '#Bank', '#Faktura', '#FakturaProforma', '#Wyciag', '#Kredyt', '#KartaKredytowa', '#Podatki',
  '#CV', '#Kariera', '#Umowa', '#Oferta', '#Korespondencja',
  '#Pismo', '#Wniosek', '#Reklamacja', '#Skarga', '#Decyzja', '#Oswiadczenie', '#Ugoda',
  '#Protokol', '#Regulamin', '#Harmonogram',
  '#Nieruchomosc', '#Zdrowie', '#RODO',
  '#Wyslane', '#Odebrane', '#Draft', '#Zalacznik',
  '#Duplikat', '#PrawdopodobnaKopia',
  '#Skan', '#Screenshot', '#Nagranie', '#Email', '#Foto', '#Grafika',
  '#AI_Sorted',
];

export const DEFAULT_STRICT_TAGS = [
  '#Bank', '#Faktura', '#KartaKredytowa', '#Kredyt', '#Podatki',
  '#RODO', '#Zdrowie',
  '#PrawdopodobnaKopia',
];

export const DEFAULT_TAG_ALIASES: Record<string, string> = {
  '#Karta':    '#KartaKredytowa',
  '#Invoice':  '#Faktura',
  '#Mortgage': '#Kredyt',
  '#Loan':     '#Kredyt',
  '#Tax':      '#Podatki',
  '#GDPR':     '#RODO',
  '#Health':   '#Zdrowie',
  '#Screen':   '#Screenshot',
  '#Photo':    '#Foto',
  '#Graphic':  '#Grafika',
  '#Video':    '#Nagranie',
  '#Resume':   '#CV',
  '#Contract': '#Umowa',
};

export const DEFAULT_STRICT_EVIDENCE: Record<string, string[]> = {
  '#Bank':              ['bank', 'iban', 'rachunek bankowy', 'numer konta', 'account number'],
  '#Faktura':           ['faktura', 'invoice', ' vat ', 'nip '],
  '#KartaKredytowa':    ['karta kredytowa', 'kartą kredytową', 'credit card'],
  '#Kredyt':            ['kredyt', 'pożyczka', 'mortgage', 'loan'],
  '#Podatki':           ['podatek', ' pit ', ' cit ', 'urząd skarbowy', 'tax return'],
  '#RODO':              ['rodo', 'gdpr', 'dane osobowe', 'rozporządzenie o ochronie danych', 'personal data'],
  '#Zdrowie':           ['nfz', ' zus ', 'lekarz', 'recepta', 'apteka', 'medical', 'prescription'],
  '#PrawdopodobnaKopia':['copy', ' kopia', 'duplikat', 'duplicate', '(1)', '(2)', '(3)', '(4)', '(5)', ' 2.', ' 3.'],
};

export const DEFAULT_PATH_RULES = [
  { pattern: '\\bbank\\b|iban|rachunek',                                flags: 'i', tags: ['#Bank'] },
  { pattern: 'faktura|invoice',                                          flags: 'i', tags: ['#Faktura'] },
  { pattern: 'proforma',                                                 flags: 'i', tags: ['#FakturaProforma'] },
  { pattern: 'wyci.g|wyciag|statement',                                  flags: 'i', tags: ['#Wyciag', '#Bank'] },
  { pattern: 'karta.kredyt|kredyt.kart|credit.card',                     flags: 'i', tags: ['#KartaKredytowa', '#Bank'] },
  { pattern: 'kredyt|po.yczka|loan|mortgage',                            flags: 'i', tags: ['#Kredyt'] },
  { pattern: 'podatek|\\bpit\\b|\\bcit\\b|urz.d.skarbow|tax.return',    flags: 'i', tags: ['#Podatki'] },
  { pattern: 'RODO|GDPR|ochrona.danych|personal.data',                   flags: 'i', tags: ['#RODO'] },
  { pattern: 'NFZ|ZUS|recepta|apteka|prescription|medical',              flags: 'i', tags: ['#Zdrowie'] },
  { pattern: 'reklamacj|complaint',                                      flags: 'i', tags: ['#Reklamacja'] },
  { pattern: '\\bskarg',                                                 flags: 'i', tags: ['#Skarga'] },
  { pattern: 'umow[ae]|contract',                                        flags: 'i', tags: ['#Umowa'] },
  { pattern: 'oferta|offer|proposal',                                    flags: 'i', tags: ['#Oferta'] },
  { pattern: 'wniosek|wniosk|application',                               flags: 'i', tags: ['#Wniosek'] },
  { pattern: 'harmonogram|schedule|timeline',                            flags: 'i', tags: ['#Harmonogram'] },
  { pattern: 'oswiadczen|o.wiadczen|statement.of',                       flags: 'i', tags: ['#Oswiadczenie'] },
  { pattern: 'decyzja|decyzj|decision',                                  flags: 'i', tags: ['#Decyzja'] },
  { pattern: 'protokol|protok..|protocol|minutes',                       flags: 'i', tags: ['#Protokol'] },
  { pattern: 'ugoda|settlement',                                         flags: 'i', tags: ['#Ugoda'] },
  { pattern: 'regulamin|terms|\\btos\\b',                               flags: 'i', tags: ['#Regulamin'] },
  { pattern: 'pismo|letter|correspondence',                              flags: 'i', tags: ['#Pismo'] },
  { pattern: '\\bcv\\b|resume|curriculum.vitae',                         flags: 'i', tags: ['#CV', '#Kariera'] },
  { pattern: 'linkedin|kariera|career',                                  flags: 'i', tags: ['#Kariera'] },
  { pattern: 'mieszkanie|nieruchomo|apartment|property|real.estate',     flags: 'i', tags: ['#Nieruchomosc'] },
  { pattern: 'screenshot|zrzut.ekranu',                                  flags: 'i', tags: ['#Screenshot'] },
  { pattern: 'nagranie|recording|screen.rec',                            flags: 'i', tags: ['#Nagranie'] },
  { pattern: 'za..[aą]cznik|attachment|enclosure',                       flags: 'i', tags: ['#Zalacznik'] },
  { pattern: '\\bIMG[\\ _-]?\\d+|\\bphoto\\b|\\bfoto\\b',               flags: 'i', tags: ['#Foto'] },
  { pattern: '[\\ \\-_](?:kopia|copy|duplikat)[\\ \\-_.]|\\(\\d+\\)',   flags: 'i', tags: ['#PrawdopodobnaKopia'] },
];

export const DEFAULT_CONTEXT =
  'EDIT ME in ~/.config/sortai/config.json. 1-2 sentence description of yourself and ongoing matters — ' +
  'used by the LLM as background context to prefer the right tags. ' +
  'Example: "Self-employed graphic designer in Warsaw. Recurring clients: AcmeCorp, BetaInc. ' +
  'Documents in PL and EN. Active: tax filings 2024, AcmeCorp branding project."';

export const DEFAULT_ORGANIZE: OrganizeConfig = {
  enabled: false,
  target: '~/Documents/Sorted',
  strategy: 'flat',
  priority: [
    '#Faktura', '#FakturaProforma', '#Wyciag', '#Bank', '#KartaKredytowa', '#Kredyt', '#Podatki',
    '#Umowa', '#Wniosek', '#Reklamacja', '#Skarga', '#Decyzja', '#Oswiadczenie', '#Ugoda',
    '#Protokol', '#Regulamin', '#Harmonogram', '#Oferta', '#Pismo', '#Korespondencja',
    '#CV', '#Kariera', '#Nieruchomosc', '#Zdrowie', '#RODO',
    '#Email', '#Zalacznik', '#Skan', '#Screenshot', '#Foto', '#Grafika', '#Nagranie',
  ],
  folderMap: {},
  unsorted: 'move',
  unsortedFolder: '_unsorted',
  multiTag: 'primary',
};

export const DEFAULT_CONFIG: Config = {
  scan: {
    folder: '~/Desktop',
    excludeFolders: ['node_modules', '.git', '.cache'],
    skipExtensions: ['.ds_store', '.sig', '.localized', '.tmp', '.lock', '.pyc'],
    ocrExtensions: ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.heic'],
    videoExtensions: ['.mov', '.mp4', '.m4v'],
  },
  ocr: {
    maxChars: 4000,
    llmMaxChars: 1500,
    startPage: 1,
    maxPages: 2,
  },
  llm: {
    provider: 'ollama',
    model: 'mistral-nemo',
    temperature: 0.15,
    numPredict: 300,
    ollamaUrl: 'http://localhost:11434',
  },
  mask: {
    enabled: false,
    lang: 'pl',
  },
  dedup: {
    enabled: true,
    maxFileSizeMB: 200,
  },
  tags: {
    allowed: DEFAULT_ALLOWED_TAGS,
    strict: DEFAULT_STRICT_TAGS,
    aliases: DEFAULT_TAG_ALIASES,
    strictEvidence: DEFAULT_STRICT_EVIDENCE,
    pathRules: DEFAULT_PATH_RULES,
    autoTag: '#AI_Sorted',
    freeForm: false,
  },
  organize: DEFAULT_ORGANIZE,
  context: DEFAULT_CONTEXT,
};

export const BAD_COMMENT_PHRASES = [
  'brak danych',
  'brak pewnych danych',
  'brak tekstu',
  'plik graficzny',
  'plik wideo',
  'rak informacji',
];
