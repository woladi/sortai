import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DEFAULT_CONFIG } from '../../src/defaults.js';
import type { Config } from '../../src/types.js';

vi.mock('../../src/organize/read-tags.js', () => ({
  readMacosTags: vi.fn(),
}));

import { readMacosTags } from '../../src/organize/read-tags.js';
import { buildOrganizePlan, pickPrimaryTag, folderForTag } from '../../src/organize/plan.js';

const mockReadTags = vi.mocked(readMacosTags);

function makeCfg(overrides: Partial<Config['organize']> = {}): Config {
  return {
    ...DEFAULT_CONFIG,
    organize: {
      ...DEFAULT_CONFIG.organize,
      target: '',
      priority: ['#Faktura', '#Bank', '#CV'],
      ...overrides,
    },
  };
}

describe('pickPrimaryTag', () => {
  it('wybiera tag z najwyższym priorytetem', () => {
    const cfg = makeCfg();
    expect(pickPrimaryTag(['#CV', '#Faktura', '#Bank'], cfg)).toBe('#Faktura');
  });

  it('fallback do pierwszego nie-meta gdy brak w priority', () => {
    const cfg = makeCfg({ priority: [] });
    expect(pickPrimaryTag(['#CV', '#AI_Sorted'], cfg)).toBe('#CV');
  });

  it('zwraca null gdy wszystkie tagi są meta', () => {
    const cfg = makeCfg();
    expect(pickPrimaryTag(['#AI_Sorted', '#Duplikat'], cfg)).toBeNull();
  });

  it('zwraca null dla pustej listy', () => {
    expect(pickPrimaryTag([], makeCfg())).toBeNull();
  });
});

describe('folderForTag', () => {
  it('używa folderMap gdy zdefiniowany', () => {
    const cfg = makeCfg({ folderMap: { '#Faktura': 'Faktury 2024' } });
    expect(folderForTag('#Faktura', cfg)).toBe('Faktury 2024');
  });

  it('domyślnie nazwa folderu = tag bez #', () => {
    expect(folderForTag('#Bank', makeCfg())).toBe('Bank');
  });
});

describe('buildOrganizePlan', () => {
  let tmpRoot: string;
  let target: string;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sortai-org-'));
    target = path.join(tmpRoot, 'sorted');
    mockReadTags.mockReset();
  });

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it('routuje po prawidłowym tagu primary', async () => {
    const src = path.join(tmpRoot, 'files');
    await fs.mkdir(src, { recursive: true });
    await fs.writeFile(path.join(src, 'a.pdf'), 'x');
    await fs.writeFile(path.join(src, 'b.pdf'), 'y');

    mockReadTags.mockImplementation(async (p: string) => {
      if (p.endsWith('a.pdf')) return ['#Faktura', '#AI_Sorted'];
      if (p.endsWith('b.pdf')) return ['#CV'];
      return [];
    });

    const cfg = makeCfg({ target });
    const plan = await buildOrganizePlan(src, cfg);

    expect(plan.moves).toHaveLength(2);
    const aMove = plan.moves.find(m => m.from.endsWith('a.pdf'));
    expect(aMove?.to).toBe(path.join(target, 'Faktura', 'a.pdf'));
    expect(aMove?.primaryTag).toBe('#Faktura');

    const bMove = plan.moves.find(m => m.from.endsWith('b.pdf'));
    expect(bMove?.to).toBe(path.join(target, 'CV', 'b.pdf'));
  });

  it('rozwiązuje konflikty nazw przez sufiks _2', async () => {
    const src = path.join(tmpRoot, 'files');
    await fs.mkdir(path.join(src, 'sub1'), { recursive: true });
    await fs.mkdir(path.join(src, 'sub2'), { recursive: true });
    await fs.writeFile(path.join(src, 'sub1', 'doc.pdf'), 'x');
    await fs.writeFile(path.join(src, 'sub2', 'doc.pdf'), 'y');

    mockReadTags.mockResolvedValue(['#Faktura']);

    const cfg = makeCfg({ target });
    const plan = await buildOrganizePlan(src, cfg);

    expect(plan.moves).toHaveLength(2);
    const destinations = plan.moves.map(m => path.basename(m.to)).sort();
    expect(destinations).toEqual(['doc.pdf', 'doc_2.pdf']);
    expect(plan.conflicts).toBe(1);
  });

  it('untagged: move → trafia do _unsorted/', async () => {
    const src = path.join(tmpRoot, 'files');
    await fs.mkdir(src, { recursive: true });
    await fs.writeFile(path.join(src, 'x.pdf'), 'z');

    mockReadTags.mockResolvedValue([]);

    const cfg = makeCfg({ target, unsorted: 'move' });
    const plan = await buildOrganizePlan(src, cfg);

    expect(plan.moves).toHaveLength(1);
    expect(plan.moves[0].to).toBe(path.join(target, '_unsorted', 'x.pdf'));
    expect(plan.moves[0].primaryTag).toBe('');
  });

  it('untagged: skip → trafia do skips', async () => {
    const src = path.join(tmpRoot, 'files');
    await fs.mkdir(src, { recursive: true });
    await fs.writeFile(path.join(src, 'x.pdf'), 'z');

    mockReadTags.mockResolvedValue([]);

    const cfg = makeCfg({ target, unsorted: 'skip' });
    const plan = await buildOrganizePlan(src, cfg);

    expect(plan.moves).toHaveLength(0);
    expect(plan.skips).toHaveLength(1);
    expect(plan.skips[0].reason).toContain('skip');
  });

  it('untagged: keep → zostawia w skips bez przenoszenia', async () => {
    const src = path.join(tmpRoot, 'files');
    await fs.mkdir(src, { recursive: true });
    await fs.writeFile(path.join(src, 'x.pdf'), 'z');

    mockReadTags.mockResolvedValue([]);

    const cfg = makeCfg({ target, unsorted: 'keep' });
    const plan = await buildOrganizePlan(src, cfg);

    expect(plan.moves).toHaveLength(0);
    expect(plan.skips[0].reason).toContain('zostawiam');
  });

  it('pomija plik który jest już w docelowym miejscu', async () => {
    const dest = path.join(target, 'Faktura');
    await fs.mkdir(dest, { recursive: true });
    const filePath = path.join(dest, 'already.pdf');
    await fs.writeFile(filePath, 'x');

    mockReadTags.mockResolvedValue(['#Faktura']);

    const cfg = makeCfg({ target });
    const plan = await buildOrganizePlan(target, cfg);

    const movesForFile = plan.moves.filter(m => m.from === filePath);
    expect(movesForFile).toHaveLength(0);
    expect(plan.skips.some(s => s.path === filePath && s.reason.includes('już w docelowym'))).toBe(true);
  });
});
