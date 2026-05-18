import type { LanguageCode, LanguageDetectionResult } from '../types.js';

const STOPWORDS: Record<LanguageCode, string[]> = {
  pl: ['i ', ' w ', ' na ', ' z ', ' do ', ' się ', ' nie ', ' jest ', ' są ', ' oraz ', ' lub ', ' za ', ' od ', ' dla ', ' co ', ' to ', ' już ', ' tym ', ' przez ', ' przy ', ' aby '],
  en: [' the ', ' and ', ' of ', ' to ', ' for ', ' in ', ' on ', ' is ', ' are ', ' with ', ' by ', ' as ', ' at ', ' from ', ' this ', ' that ', ' be ', ' or ', ' has ', ' have '],
};

export function detectLanguages(texts: string[]): LanguageDetectionResult {
  const scores: Record<LanguageCode, number> = { pl: 0, en: 0 };
  for (const txt of texts) {
    if (!txt) continue;
    const lower = ' ' + txt.toLowerCase().replace(/\s+/g, ' ') + ' ';
    for (const lang of Object.keys(STOPWORDS) as LanguageCode[]) {
      for (const sw of STOPWORDS[lang]) {
        let idx = 0;
        while ((idx = lower.indexOf(sw, idx)) !== -1) {
          scores[lang]++;
          idx += sw.length;
        }
      }
    }
  }

  const total = scores.pl + scores.en;
  const ratios: Record<LanguageCode, number> = {
    pl: total > 0 ? scores.pl / total : 0,
    en: total > 0 ? scores.en / total : 0,
  };

  const dominant: LanguageCode = ratios.pl >= ratios.en ? 'pl' : 'en';
  const bilingual = total > 0 && Math.min(ratios.pl, ratios.en) >= 0.2;

  return { dominant, scores: ratios, bilingual };
}

export function languageList(result: LanguageDetectionResult): LanguageCode[] {
  if (result.bilingual) return ['pl', 'en'];
  return [result.dominant];
}
