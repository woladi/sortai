import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/defaults.js';
import {
  normalizeTag,
  mergeTags,
  isStrictTag,
  strictTagHasEvidence,
  isMetaTag,
  TagDiscovery,
} from '../src/tags.js';
import type { Config } from '../src/types.js';

const cfg: Config = {
  ...DEFAULT_CONFIG,
  tags: {
    allowed: ['#Faktura', '#Bank', '#CV', '#AI_Sorted'],
    strict: ['#Faktura'],
    aliases: { '#Invoice': '#Faktura', '#Resume': '#CV' },
    strictEvidence: { '#Faktura': ['faktura', 'invoice'] },
    pathRules: [],
    autoTag: '#AI_Sorted',
    freeForm: false,
  },
};

describe('normalizeTag', () => {
  it('zwraca tag z listy allowed', () => {
    expect(normalizeTag('#Faktura', cfg)).toBe('#Faktura');
  });

  it('dodaje # gdy brakuje', () => {
    expect(normalizeTag('Faktura', cfg)).toBe('#Faktura');
  });

  it('rozwiązuje alias do tagu docelowego', () => {
    expect(normalizeTag('#Invoice', cfg)).toBe('#Faktura');
    expect(normalizeTag('#Resume', cfg)).toBe('#CV');
  });

  it('odrzuca tag spoza allowed gdy freeForm=false', () => {
    expect(normalizeTag('#Nieznany', cfg)).toBeNull();
  });

  it('przepuszcza nowy tag gdy freeForm=true (param)', () => {
    expect(normalizeTag('#Nowy', cfg, true)).toBe('#Nowy');
  });

  it('przepuszcza nowy tag gdy cfg.tags.freeForm=true', () => {
    const free: Config = { ...cfg, tags: { ...cfg.tags, freeForm: true } };
    expect(normalizeTag('#Nowy', free)).toBe('#Nowy');
  });

  it('odrzuca tag z niedozwolonymi znakami nawet w freeForm', () => {
    expect(normalizeTag('#bad tag!', cfg, true)).toBeNull();
    expect(normalizeTag('#tag.kropka', cfg, true)).toBeNull();
    expect(normalizeTag('#tag/slash', cfg, true)).toBeNull();
  });

  it('przepuszcza polskie/unicode znaki w freeForm', () => {
    expect(normalizeTag('#Płatność', cfg, true)).toBe('#Płatność');
    expect(normalizeTag('#Garaż', cfg, true)).toBe('#Garaż');
    expect(normalizeTag('#Zdjęcia', cfg, true)).toBe('#Zdjęcia');
  });

  it('zwraca null dla non-string', () => {
    expect(normalizeTag(123 as unknown, cfg)).toBeNull();
    expect(normalizeTag(null, cfg)).toBeNull();
    expect(normalizeTag('', cfg)).toBeNull();
  });
});

describe('mergeTags', () => {
  it('deduplikuje zachowując kolejność', () => {
    const result = mergeTags(cfg, ['#Faktura'], ['#Bank', '#Faktura'], ['#CV']);
    expect(result).toEqual(['#Faktura', '#Bank', '#CV']);
  });

  it('rozwiązuje aliasy podczas mergowania', () => {
    expect(mergeTags(cfg, ['#Invoice', '#Faktura'])).toEqual(['#Faktura']);
  });

  it('pomija nieznane tagi gdy freeForm=false', () => {
    expect(mergeTags(cfg, ['#Faktura', '#Nieznany', '#Bank'])).toEqual(['#Faktura', '#Bank']);
  });

  it('ignoruje null/undefined w listach', () => {
    expect(mergeTags(cfg, ['#Faktura'], null, undefined, ['#Bank'])).toEqual(['#Faktura', '#Bank']);
  });
});

describe('strict tags', () => {
  it('isStrictTag rozpoznaje tag z listy strict', () => {
    expect(isStrictTag('#Faktura', cfg)).toBe(true);
    expect(isStrictTag('#Bank', cfg)).toBe(false);
  });

  it('strictTagHasEvidence wymaga literalnego dowodu', () => {
    expect(strictTagHasEvidence('#Faktura', 'To jest FAKTURA VAT', cfg)).toBe(true);
    expect(strictTagHasEvidence('#Faktura', 'invoice 2024', cfg)).toBe(true);
    expect(strictTagHasEvidence('#Faktura', 'jakiś dokument', cfg)).toBe(false);
  });

  it('strictTagHasEvidence zwraca false dla tagu bez evidence', () => {
    expect(strictTagHasEvidence('#Bank', 'anything', cfg)).toBe(false);
  });
});

describe('isMetaTag', () => {
  it('rozpoznaje autoTag i znaczniki duplikatów', () => {
    expect(isMetaTag('#AI_Sorted', cfg)).toBe(true);
    expect(isMetaTag('#Duplikat', cfg)).toBe(true);
    expect(isMetaTag('#PrawdopodobnaKopia', cfg)).toBe(true);
  });

  it('zwykłe tagi nie są meta', () => {
    expect(isMetaTag('#Faktura', cfg)).toBe(false);
  });
});

describe('TagDiscovery', () => {
  it('zlicza wystąpienia tagów', () => {
    const d = new TagDiscovery();
    d.record('#X');
    d.record('#Y');
    d.record('#X');
    expect(d.size).toBe(2);
    const entries = d.entries();
    expect(entries[0]).toEqual({ tag: '#X', count: 2 });
    expect(entries[1]).toEqual({ tag: '#Y', count: 1 });
  });
});
