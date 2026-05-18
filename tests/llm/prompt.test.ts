import { describe, expect, it } from 'vitest';
import { buildTaxonomyPrompt, parseJsonSafe } from '../../src/llm/prompt.js';
import type { SampledFile } from '../../src/types.js';

describe('parseJsonSafe', () => {
  it('parsuje czysty JSON', () => {
    expect(parseJsonSafe('{"a":1}')).toEqual({ a: 1 });
  });

  it('parsuje JSON owinięty w markdown', () => {
    const wrapped = '```json\n{"x": 42}\n```';
    expect(parseJsonSafe(wrapped)).toEqual({ x: 42 });
  });

  it('parsuje JSON z prefixem tekstu', () => {
    const noisy = 'Sure, here you go:\n{"tag":"#X"}\nThat is all.';
    expect(parseJsonSafe(noisy)).toEqual({ tag: '#X' });
  });

  it('zwraca pusty obiekt dla śmieci', () => {
    expect(parseJsonSafe('totally not json')).toEqual({});
    expect(parseJsonSafe('')).toEqual({});
  });
});

describe('buildTaxonomyPrompt', () => {
  const samples: SampledFile[] = [
    { path: '/a/faktura.pdf', name: 'faktura_acme.pdf', ext: '.pdf', ocrText: 'Faktura VAT nr 123 NIP 9876' },
    { path: '/a/cv.pdf', name: 'cv_jan.pdf', ext: '.pdf', ocrText: 'Curriculum Vitae — Jan Kowalski' },
  ];

  it('zawiera nazwy plików i fragmenty OCR', () => {
    const prompt = buildTaxonomyPrompt(samples, ['pl', 'en'], 'kontekst');
    expect(prompt).toContain('faktura_acme.pdf');
    expect(prompt).toContain('cv_jan.pdf');
    expect(prompt).toContain('Faktura VAT');
    expect(prompt).toContain('Curriculum Vitae');
  });

  it('zawiera listę języków i kontekst', () => {
    const prompt = buildTaxonomyPrompt(samples, ['pl', 'en'], 'moja firma');
    expect(prompt).toContain('pl + en');
    expect(prompt).toContain('moja firma');
  });

  it('dorzuca opcjonalny hint', () => {
    const prompt = buildTaxonomyPrompt(samples, ['pl'], '', 'więcej kategorii finansowych');
    expect(prompt).toContain('więcej kategorii finansowych');
  });

  it('nie zawiera "Dodatkowa wskazówka" bez hinta', () => {
    const prompt = buildTaxonomyPrompt(samples, ['pl'], '');
    expect(prompt).not.toContain('Dodatkowa wskazówka');
  });

  it('przycina OCR do 600 znaków', () => {
    const long: SampledFile = {
      path: '/x.pdf', name: 'x.pdf', ext: '.pdf',
      ocrText: 'A'.repeat(2000),
    };
    const prompt = buildTaxonomyPrompt([long], ['pl'], '');
    const aSequence = prompt.match(/A+/g)?.[0] ?? '';
    expect(aSequence.length).toBeLessThanOrEqual(600);
  });
});
