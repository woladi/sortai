import { describe, expect, it } from 'vitest';
import { detectLanguages, languageList } from '../../src/wizard/languages.js';

describe('detectLanguages', () => {
  it('wykrywa dominację polskiego', () => {
    const polishHeavy = [
      'To jest faktura na kwotę 1234 złotych w styczniu',
      'Dokument zawiera dane osobowe oraz informacje o transakcji',
      'Wniosek został złożony do urzędu w terminie',
    ];
    const result = detectLanguages(polishHeavy);
    expect(result.dominant).toBe('pl');
    expect(result.scores.pl).toBeGreaterThan(result.scores.en);
  });

  it('wykrywa dominację angielskiego', () => {
    const englishHeavy = [
      'This is an invoice for the amount of 1234 dollars in January',
      'The document contains personal data and transaction information',
      'The application was submitted on time to the office',
    ];
    const result = detectLanguages(englishHeavy);
    expect(result.dominant).toBe('en');
    expect(result.scores.en).toBeGreaterThan(result.scores.pl);
  });

  it('oznacza bilingual gdy oba języki mają >=20%', () => {
    const mixed = [
      'To jest faktura za usługę i to jest faktura w nowym roku',
      'This is an invoice for the service and this is an invoice from the company',
    ];
    const result = detectLanguages(mixed);
    expect(result.bilingual).toBe(true);
  });

  it('zwraca neutralny wynik dla pustego inputu', () => {
    const result = detectLanguages([]);
    expect(result.scores.pl).toBe(0);
    expect(result.scores.en).toBe(0);
    expect(result.bilingual).toBe(false);
  });

  it('languageList zwraca [pl,en] dla bilingual', () => {
    expect(languageList({ dominant: 'pl', bilingual: true, scores: { pl: 0.5, en: 0.5 } }))
      .toEqual(['pl', 'en']);
  });

  it('languageList zwraca tylko dominujący gdy nie bilingual', () => {
    expect(languageList({ dominant: 'pl', bilingual: false, scores: { pl: 0.9, en: 0.1 } }))
      .toEqual(['pl']);
  });
});
