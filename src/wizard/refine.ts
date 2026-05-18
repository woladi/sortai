import chalk from 'chalk';
import { select, input, confirm, editor } from '@inquirer/prompts';
import { preTagFromPath } from '../pretag.js';
import { mergeTags } from '../tags.js';
import { inferTagsAndComment } from '../llm/index.js';
import type { Config, SampledFile, Taxonomy, TaxonomyCategory, LanguageCode } from '../types.js';
import { applyTaxonomyToConfig, generateTaxonomy } from './taxonomy.js';

function pad(s: string, w: number): string {
  return s.length >= w ? s : s + ' '.repeat(w - s.length);
}

export function renderTaxonomyTable(tax: Taxonomy): string {
  if (tax.categories.length === 0) return chalk.yellow('(brak kategorii)');
  const lines: string[] = [];
  const nameW = Math.max(6, ...tax.categories.map(c => c.name.length));
  lines.push(chalk.bold(`${pad('Tag', nameW)}  Strict  Przykłady`));
  lines.push(chalk.gray('─'.repeat(Math.min(80, nameW + 12 + 50))));
  for (const c of tax.categories) {
    const examples = c.examples.slice(0, 3).join(', ') || chalk.gray('(brak)');
    const strict = c.isStrict ? chalk.yellow('  ✓   ') : '      ';
    lines.push(`${pad(c.name, nameW)}  ${strict}  ${examples}`);
  }
  if (tax.summary) {
    lines.push('');
    lines.push(chalk.gray(`Podsumowanie: ${tax.summary}`));
  }
  return lines.join('\n');
}

async function editCategory(cat: TaxonomyCategory): Promise<TaxonomyCategory | null> {
  while (true) {
    const action = await select<'name' | 'desc' | 'aliases' | 'strict' | 'evidence' | 'drop' | 'done'>({
      message: `Edytuj ${chalk.cyan(cat.name)} (strict=${cat.isStrict}, aliasy=[${cat.aliases.join(',')}])`,
      choices: [
        { name: 'Zmień nazwę', value: 'name' },
        { name: 'Zmień opis', value: 'desc' },
        { name: 'Zmień aliasy (CSV)', value: 'aliases' },
        { name: cat.isStrict ? 'Wyłącz strict' : 'Włącz strict', value: 'strict' },
        { name: 'Zmień strict_evidence (CSV)', value: 'evidence' },
        { name: chalk.red('Usuń tag'), value: 'drop' },
        { name: chalk.green('Gotowe'), value: 'done' },
      ],
    });
    if (action === 'done') return cat;
    if (action === 'drop') return null;
    if (action === 'name') {
      const v = await input({ message: 'Nowa nazwa (#Tag):', default: cat.name });
      cat.name = v.startsWith('#') ? v : `#${v}`;
    } else if (action === 'desc') {
      cat.description = await input({ message: 'Opis:', default: cat.description });
    } else if (action === 'aliases') {
      const v = await input({ message: 'Aliasy (oddzielone przecinkiem):', default: cat.aliases.join(',') });
      cat.aliases = v.split(',').map(s => s.trim()).filter(Boolean).map(a => a.startsWith('#') ? a : `#${a}`);
    } else if (action === 'strict') {
      cat.isStrict = !cat.isStrict;
    } else if (action === 'evidence') {
      const v = await input({ message: 'Słowa-dowody (oddzielone przecinkiem):', default: cat.strictEvidence.join(',') });
      cat.strictEvidence = v.split(',').map(s => s.trim()).filter(Boolean);
    }
  }
}

async function showSamplePreview(
  taxonomy: Taxonomy,
  samples: SampledFile[],
  baseCfg: Config,
): Promise<void> {
  const cfg = applyTaxonomyToConfig(taxonomy, baseCfg);
  process.stdout.write('\n' + chalk.cyan('🔍 Podgląd tagowania na próbce (bez zapisu):\n\n'));

  for (const s of samples.slice(0, 10)) {
    const preTags = preTagFromPath(s.path, s.ocrText, cfg);
    process.stdout.write(chalk.bold(`  ${s.name}\n`));
    let tags: string[];
    let comment: string;
    if (preTags.length >= 4 && !s.ocrText.trim()) {
      tags = mergeTags(cfg, preTags, [cfg.tags.autoTag]);
      comment = `Auto z nazwy/ścieżki: ${s.name}.`;
    } else {
      try {
        const res = await inferTagsAndComment(
          { fileName: s.name, ext: s.ext, preTags, ocrText: s.ocrText },
          cfg,
        );
        tags = res.tags;
        comment = res.comment;
      } catch {
        tags = preTags;
        comment = `Plik: ${s.name}.`;
      }
    }
    const color = tags.length >= 2 ? chalk.green : tags.length === 1 ? chalk.yellow : chalk.red;
    process.stdout.write(color(`    ${tags.join(' ') || '(brak tagów)'}\n`));
    process.stdout.write(chalk.gray(`    ${comment}\n`));
  }
  process.stdout.write('\n');
}

export interface RefineDeps {
  samples: SampledFile[];
  langs: LanguageCode[];
  userContext: string;
  baseCfg: Config;
}

export async function refineTaxonomyLoop(
  initial: Taxonomy,
  deps: RefineDeps,
): Promise<Taxonomy> {
  let taxonomy: Taxonomy = { ...initial, categories: [...initial.categories] };

  while (true) {
    process.stdout.write('\n' + renderTaxonomyTable(taxonomy) + '\n\n');

    const action = await select<'accept' | 'edit' | 'add' | 'editor' | 'regen' | 'preview'>({
      message: 'Co dalej z taksonomią?',
      choices: [
        { name: chalk.green('Akceptuj i zapisz config'), value: 'accept' },
        { name: 'Edytuj per-tag (rename / strict / drop / evidence)', value: 'edit' },
        { name: 'Dodaj nowy tag ręcznie', value: 'add' },
        { name: 'Otwórz w edytorze ($EDITOR)', value: 'editor' },
        { name: 'Regeneruj LLM-em z dodatkową wskazówką', value: 'regen' },
        { name: 'Pokaż jak otaguje próbkę z tym configiem', value: 'preview' },
      ],
    });

    if (action === 'accept') return taxonomy;

    if (action === 'edit') {
      if (taxonomy.categories.length === 0) {
        process.stdout.write(chalk.yellow('Brak tagów do edycji.\n'));
        continue;
      }
      const chosen = await select<number>({
        message: 'Który tag edytować?',
        choices: taxonomy.categories.map((c, i) => ({ name: `${c.name} (${c.isStrict ? 'strict' : 'safe'})`, value: i })),
      });
      const edited = await editCategory({ ...taxonomy.categories[chosen] });
      const next = [...taxonomy.categories];
      if (edited === null) {
        next.splice(chosen, 1);
      } else {
        next[chosen] = edited;
      }
      taxonomy = { ...taxonomy, categories: next };
    }

    if (action === 'add') {
      const name = await input({ message: 'Nazwa tagu (#Tag):' });
      if (!name) continue;
      const normalized = name.startsWith('#') ? name : `#${name}`;
      const description = await input({ message: 'Opis (opcjonalnie):' });
      const isStrict = await confirm({ message: 'Tag strict (wymaga słów-dowodów)?', default: false });
      const evidence = isStrict
        ? (await input({ message: 'Słowa-dowody (CSV):' })).split(',').map(s => s.trim()).filter(Boolean)
        : [];
      const aliasInput = await input({ message: 'Aliasy (CSV, opcjonalnie):' });
      const aliases = aliasInput.split(',').map(s => s.trim()).filter(Boolean).map(a => a.startsWith('#') ? a : `#${a}`);
      taxonomy = {
        ...taxonomy,
        categories: [
          ...taxonomy.categories,
          { name: normalized, description, aliases, strictEvidence: evidence, isStrict, examples: [] },
        ],
      };
    }

    if (action === 'editor') {
      const draft = JSON.stringify(taxonomy.categories, null, 2);
      const edited = await editor({
        message: 'Edytuj kategorie jako JSON. Zapisz i zamknij edytor żeby kontynuować.',
        default: draft,
        postfix: '.json',
      });
      try {
        const parsed = JSON.parse(edited);
        if (Array.isArray(parsed)) {
          taxonomy = { ...taxonomy, categories: parsed };
        } else {
          process.stdout.write(chalk.red('Nie tablica — anulowano.\n'));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stdout.write(chalk.red(`Błąd JSON: ${msg} — anulowano.\n`));
      }
    }

    if (action === 'regen') {
      const hint = await input({
        message: 'Wskazówka dla LLM (np. "więcej kategorii finansowych", "rozdziel CV i kariera"):',
      });
      try {
        const next = await generateTaxonomy(deps.samples, deps.langs, deps.userContext, deps.baseCfg, hint);
        taxonomy = next;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stdout.write(chalk.red(`Regeneracja nieudana: ${msg}\n`));
      }
    }

    if (action === 'preview') {
      try {
        await showSamplePreview(taxonomy, deps.samples, deps.baseCfg);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stdout.write(chalk.red(`Podgląd nieudany: ${msg}\n`));
      }
    }
  }
}
