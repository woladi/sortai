import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/defaults.js';
import { applyTaxonomyToConfig, taxonomyFromConfig } from '../../src/wizard/taxonomy.js';
import type { Taxonomy } from '../../src/types.js';

const taxonomy: Taxonomy = {
  categories: [
    {
      name: '#Faktura',
      description: 'Faktury VAT i proforma',
      aliases: ['#Invoice'],
      strictEvidence: ['faktura', 'invoice', 'vat'],
      isStrict: true,
      examples: ['faktura_acme.pdf'],
    },
    {
      name: '#CV',
      description: 'CV i resume',
      aliases: ['#Resume'],
      strictEvidence: [],
      isStrict: false,
      examples: ['cv_jan.pdf'],
    },
  ],
  summary: 'Dwie kategorie',
};

describe('applyTaxonomyToConfig', () => {
  it('przepisuje kategorie do allowed/strict/aliases/strictEvidence', () => {
    const updated = applyTaxonomyToConfig(taxonomy, DEFAULT_CONFIG);
    expect(updated.tags.allowed).toContain('#Faktura');
    expect(updated.tags.allowed).toContain('#CV');
    expect(updated.tags.strict).toEqual(['#Faktura']);
    expect(updated.tags.aliases['#Invoice']).toBe('#Faktura');
    expect(updated.tags.aliases['#Resume']).toBe('#CV');
    expect(updated.tags.strictEvidence['#Faktura']).toEqual(['faktura', 'invoice', 'vat']);
  });

  it('zachowuje autoTag i pomocnicze tagi w allowed', () => {
    const updated = applyTaxonomyToConfig(taxonomy, DEFAULT_CONFIG);
    expect(updated.tags.allowed).toContain('#AI_Sorted');
    expect(updated.tags.allowed).toContain('#Duplikat');
    expect(updated.tags.allowed).toContain('#Skan');
  });

  it('nie nadpisuje istniejących aliasów configu (merge)', () => {
    const base = {
      ...DEFAULT_CONFIG,
      tags: { ...DEFAULT_CONFIG.tags, aliases: { '#Custom': '#Bank' } },
    };
    const updated = applyTaxonomyToConfig(taxonomy, base);
    expect(updated.tags.aliases['#Custom']).toBe('#Bank');
    expect(updated.tags.aliases['#Invoice']).toBe('#Faktura');
  });
});

describe('taxonomyFromConfig', () => {
  it('roundtrip: config → taxonomy → config zachowuje strict/aliases/evidence', () => {
    const initial = applyTaxonomyToConfig(taxonomy, DEFAULT_CONFIG);
    const tax = taxonomyFromConfig(initial);
    const back = applyTaxonomyToConfig(tax, DEFAULT_CONFIG);
    expect(back.tags.strict.sort()).toEqual(['#Faktura']);
    expect(back.tags.aliases['#Invoice']).toBe('#Faktura');
    expect(back.tags.strictEvidence['#Faktura']).toEqual(['faktura', 'invoice', 'vat']);
  });

  it('pomija autoTag w kategoriach', () => {
    const tax = taxonomyFromConfig(DEFAULT_CONFIG);
    const names = tax.categories.map(c => c.name);
    expect(names).not.toContain('#AI_Sorted');
  });
});
