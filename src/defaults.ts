import type { Config } from './types.js';

export const DEFAULT_ALLOWED_TAGS = [
  '#BNPParibas', '#PKOBP', '#Revolut', '#WS48', '#UODO', '#UOKiK', '#BIK',
  '#KaczmarskiInkasso', '#CreditAngel',
  '#BANKI', '#KredytHipoteczny', '#KredytGotowkowy', '#KartaKredytowa',
  '#LimitROR', '#SKD',
  '#RODO', '#Windykacja', '#WakacjeKredytowe', '#Nieruchomosc',
  '#Kariera', '#CV', '#Zdrowie', '#Spadek', '#UrzadPracy',
  '#Branding', '#YouthRebuild', '#Gecko', '#Weles',
  '#Umowa', '#Faktura', '#FakturaProforma', '#Reklamacja', '#Skarga', '#Oswiadczenie',
  '#Wniosek', '#Wyciag', '#Harmonogram', '#Decyzja', '#RaportBIK', '#Pismo', '#Protokol',
  '#Ugoda', '#Draft', '#Transkrypcja', '#Regulamin', '#Brief',
  '#Wyslane', '#Odebrane', '#Dowod', '#Zalacznik', '#Duplikat',
  '#Skan', '#Screenshot', '#Nagranie', '#Email', '#Foto', '#Grafika', '#AI_Sorted',
];

export const DEFAULT_STRICT_TAGS = [
  '#BNPParibas', '#PKOBP', '#Revolut', '#KaczmarskiInkasso', '#CreditAngel',
  '#UODO', '#UOKiK', '#BIK',
  '#KartaKredytowa', '#KredytHipoteczny', '#KredytGotowkowy',
  '#LimitROR', '#SKD', '#WakacjeKredytowe', '#Windykacja', '#RODO',
];

export const DEFAULT_TAG_ALIASES: Record<string, string> = {
  '#Banki': '#BANKI',
  '#banki': '#BANKI',
  '#Hipoteczny': '#KredytHipoteczny',
  '#Gotowkowy': '#KredytGotowkowy',
  '#Gotówkowy': '#KredytGotowkowy',
  '#KredytGotówkowy': '#KredytGotowkowy',
  '#Karta': '#KartaKredytowa',
  '#Wspólnota': '#Nieruchomosc',
  '#Wspolnota': '#Nieruchomosc',
  '#Mieszkanie': '#Nieruchomosc',
  '#RODOComplaint': '#RODO',
  '#DebtCollection': '#Windykacja',
  '#Screen': '#Screenshot',
  '#Photo': '#Foto',
  '#Graphic': '#Grafika',
  '#Video': '#Nagranie',
};

export const DEFAULT_STRICT_EVIDENCE: Record<string, string[]> = {
  '#BNPParibas':        ['bnp paribas', 'bnpparibas'],
  '#PKOBP':             ['pko bp', 'pkobp', 'powszechna kasa'],
  '#Revolut':           ['revolut'],
  '#KaczmarskiInkasso': ['kaczmarski', 'inkasso'],
  '#CreditAngel':       ['creditangel', 'credit angel'],
  '#UODO':              ['uodo', 'urząd ochrony danych'],
  '#UOKiK':             ['uokik', 'urząd ochrony konkurencji'],
  '#BIK':               ['biuro informacji kredytowej', ' bik '],
  '#KartaKredytowa':    ['karta kredytowa', 'kartą kredytową', 'credit card'],
  '#KredytHipoteczny':  ['kredyt hipoteczny', 'hipoteczn', 'mortgage', 'hipoteka'],
  '#KredytGotowkowy':   ['kredyt gotówkowy', 'gotówkow', 'gotowkow', 'cash loan', 'kredyt konsumencki'],
  '#LimitROR':          ['limit ror', 'debet', 'rachunek oszczędnościowo-rozliczeniowy'],
  '#SKD':               ['sankcja kredytu darmowego', 'skd'],
  '#WakacjeKredytowe':  ['wakacje kredytowe'],
  '#Windykacja':        ['windykacj', 'wezwanie do zapłaty', 'zaległość', 'inkasso'],
  '#RODO':              ['rozporządzenie o ochronie danych', 'rodo', 'gdpr', 'dane osobowe'],
};

export const DEFAULT_PATH_RULES = [
  { pattern: 'BNP.Paribas|BNP_Paribas',                       flags: 'i', tags: ['#BNPParibas', '#BANKI'] },
  { pattern: 'PKO.BP|PKO_BP|PKOBP|Powszechna.Kasa',           flags: 'i', tags: ['#PKOBP', '#BANKI'] },
  { pattern: 'Revolut',                                        flags: 'i', tags: ['#Revolut', '#BANKI'] },
  { pattern: 'WPS48|WS48|wspolnota|wita.stwosz|manhattan',     flags: 'i', tags: ['#WS48', '#Nieruchomosc'] },
  { pattern: 'Kaczmarski|inkasso',                              flags: 'i', tags: ['#KaczmarskiInkasso', '#Windykacja'] },
  { pattern: 'CreditAngel',                                     flags: 'i', tags: ['#CreditAngel'] },
  { pattern: 'UODO|ochrony.danych',                             flags: 'i', tags: ['#UODO', '#RODO'] },
  { pattern: 'UOKiK',                                           flags: 'i', tags: ['#UOKiK'] },
  { pattern: '\\bBIK\\b|biuro.informacji.kredyt',              flags: 'i', tags: ['#BIK'] },
  { pattern: 'karta.kredyt|kredyt.kart',                        flags: 'i', tags: ['#KartaKredytowa', '#BANKI'] },
  { pattern: 'kredyt.hipot|hipotecz',                           flags: 'i', tags: ['#KredytHipoteczny', '#BANKI'] },
  { pattern: 'kredyt.gotow|gotowkow|got.wkow',                  flags: 'i', tags: ['#KredytGotowkowy', '#BANKI'] },
  { pattern: 'limit.ror|debet.ror',                             flags: 'i', tags: ['#LimitROR', '#BANKI'] },
  { pattern: 'sankcja.kredyt|\\bskd\\b',                       flags: 'i', tags: ['#SKD', '#BANKI'] },
  { pattern: 'wakacje.kredyt',                                  flags: 'i', tags: ['#WakacjeKredytowe', '#BANKI'] },
  { pattern: 'windykacj|wezwanie.do.zap',                       flags: 'i', tags: ['#Windykacja'] },
  { pattern: '\\bRODO\\b|GDPR|ochrona.danych',                 flags: 'i', tags: ['#RODO'] },
  { pattern: 'reklamacj',                                       flags: 'i', tags: ['#Reklamacja'] },
  { pattern: '\\bskarg',                                       flags: 'i', tags: ['#Skarga'] },
  { pattern: 'wypowiedzen',                                     flags: 'i', tags: ['#Pismo'] },
  { pattern: 'umow[ae]',                                        flags: 'i', tags: ['#Umowa'] },
  { pattern: 'wyci.g|wyciag',                                   flags: 'i', tags: ['#Wyciag'] },
  { pattern: 'harmonogram',                                     flags: 'i', tags: ['#Harmonogram'] },
  { pattern: 'oswiadczen|o.wiadczen',                           flags: 'i', tags: ['#Oswiadczenie'] },
  { pattern: 'wniosek|wniosk',                                  flags: 'i', tags: ['#Wniosek'] },
  { pattern: 'faktura',                                         flags: 'i', tags: ['#Faktura'] },
  { pattern: 'ugoda',                                           flags: 'i', tags: ['#Ugoda'] },
  { pattern: 'regulamin',                                       flags: 'i', tags: ['#Regulamin'] },
  { pattern: 'transkrypcj|transcript',                          flags: 'i', tags: ['#Transkrypcja'] },
  { pattern: 'decyzja|decyzj',                                  flags: 'i', tags: ['#Decyzja'] },
  { pattern: 'protokol|protok..',                               flags: 'i', tags: ['#Protokol'] },
  { pattern: '\\bcv\\b|resume|curriculum.vitae',               flags: 'i', tags: ['#CV', '#Kariera'] },
  { pattern: 'linkedin|kariera',                                flags: 'i', tags: ['#Kariera'] },
  { pattern: 'NFZ|narodowy.fundusz.zdrowia',                   flags: 'i', tags: ['#Zdrowie'] },
  { pattern: '\\bZUS\\b',                                      flags: 'i', tags: ['#Zdrowie'] },
  { pattern: 'urzad.pracy|urz.d.pracy|\\bPUP\\b|\\bWUP\\b|\\bIPD\\b', flags: 'i', tags: ['#UrzadPracy', '#Kariera'] },
  { pattern: 'youth.rebuild|youthrebuild',                      flags: 'i', tags: ['#YouthRebuild'] },
  { pattern: '\\bgecko\\b',                                    flags: 'i', tags: ['#Gecko'] },
  { pattern: '\\bweles\\b',                                    flags: 'i', tags: ['#Weles'] },
  { pattern: 'screenshot|zrzut.ekranu',                         flags: 'i', tags: ['#Screenshot'] },
  { pattern: 'nagranie|recording|screen.rec',                   flags: 'i', tags: ['#Nagranie'] },
  { pattern: 'za..[aą]cznik|attachment',                        flags: 'i', tags: ['#Zalacznik'] },
  { pattern: 'branding|\\blogo\\b',                            flags: 'i', tags: ['#Branding'] },
  { pattern: '[\\ \\-_](?:kopia|copy|duplikat|\\d+)[\\ \\-_.]', flags: 'i', tags: ['#Duplikat'] },
];

export const DEFAULT_CONTEXT =
  'Wlasciciel: Adrian Wolczuk, Elblag, front-end developer. ' +
  'Aktywne sprawy: BNP Paribas (karta kredytowa 5285, kredyt gotowkowy, SKD), ' +
  'PKO BP (limit ROR), Revolut (karta), Kaczmarski Inkasso (windykacja BNP), ' +
  'CreditAngel (branding/projekt), WS48 (wspolnota mieszkaniowa Wita Stwosza 48), ' +
  'YouthRebuild (projekt spoleczny), urzad pracy (IPD, RODO-zgody).';

export const DEFAULT_CONFIG: Config = {
  scan: {
    folder: '~/Desktop',
    excludeFolders: ['AI_Sorter', 'Dupa'],
    skipExtensions: ['.ds_store', '.sig', '.localized', '.tmp', '.lock', '.pyc'],
    ocrExtensions: ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.heic'],
    videoExtensions: ['.mov', '.mp4', '.m4v'],
  },
  ocr: {
    maxChars: 4000,
    llmMaxChars: 1500,
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
  tags: {
    allowed: DEFAULT_ALLOWED_TAGS,
    strict: DEFAULT_STRICT_TAGS,
    aliases: DEFAULT_TAG_ALIASES,
    strictEvidence: DEFAULT_STRICT_EVIDENCE,
    pathRules: DEFAULT_PATH_RULES,
    autoTag: '#AI_Sorted',
  },
  context: DEFAULT_CONTEXT,
};

export const BAD_COMMENT_PHRASES = [
  'jedno zdanie po polsku',
  'jedno zdanie po polsku.',
  'brak danych',
  'brak pewnych danych',
  'brak tekstu',
  'plik graficzny',
  'plik wideo',
  'rak informacji',
];
