import path from 'node:path';
import { existsSync } from 'node:fs';
import chalk from 'chalk';
import ora from 'ora';
import { select, input, confirm, password } from '@inquirer/prompts';
import { DEFAULT_CONFIG, DEFAULT_ORGANIZE } from '../defaults.js';
import { expandHome, saveConfig, resolveConfigPath } from '../config.js';
import { probeOllama, modelSizeLabel, SUGGESTED_OLLAMA_MODELS } from '../llm/ollama-detect.js';
import type { Config, OrganizeConfig, LanguageCode, SampledFile } from '../types.js';
import { pickSampleFiles, ocrSamples } from './sample.js';
import { detectLanguages, languageList } from './languages.js';
import { generateTaxonomy, applyTaxonomyToConfig } from './taxonomy.js';
import { refineTaxonomyLoop, renderTaxonomyTable } from './refine.js';

export type WizardMode = 'tag' | 'organize' | 'tag+organize' | 'discovery';

export interface WizardOptions {
  configPath?: string;
  apiKey?: string;
  folderHint?: string;
}

export interface WizardResult {
  config: Config;
  configPath: string;
  mode: WizardMode;
  shouldRunTag: boolean;
  shouldRunOrganize: boolean;
}

const CLOUD_MODELS: Record<'anthropic' | 'openai', Array<{ name: string; label: string }>> = {
  anthropic: [
    { name: 'claude-opus-4-7', label: 'Claude Opus 4.7 — najmocniejszy' },
    { name: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 — szybki + mocny (rekomendowany)' },
    { name: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 — najszybszy' },
  ],
  openai: [
    { name: 'gpt-4o', label: 'GPT-4o' },
    { name: 'gpt-4o-mini', label: 'GPT-4o mini — szybki, tani' },
  ],
};

async function askMode(): Promise<WizardMode> {
  return select<WizardMode>({
    message: 'Co chcesz robić z plikami?',
    choices: [
      { name: 'Tagowanie (Finder tagi + komentarze)', value: 'tag', description: 'Zapisuje tagi i komentarze do xattr plików, indeksuje Spotlight.' },
      { name: 'Sortowanie do folderów (na bazie istniejących tagów)', value: 'organize', description: 'Przenosi pliki do folderów zgodnie z tagami które już mają.' },
      { name: 'Tagowanie + sortowanie', value: 'tag+organize', description: 'Najpierw nakłada tagi, potem przenosi do folderów.' },
      { name: 'Tylko discovery (próbka, bez modyfikacji)', value: 'discovery', description: 'Pokaż jak LLM widzi Twoją kolekcję, bez zapisywania niczego.' },
    ],
  });
}

async function askScan(defaultFolder: string): Promise<Config['scan']> {
  const folder = await input({ message: 'Folder do skanowania (rekurencyjnie):', default: defaultFolder });
  const excludeCsv = await input({
    message: 'Wyklucz podkatalogi (CSV):',
    default: DEFAULT_CONFIG.scan.excludeFolders.join(','),
  });
  return {
    folder,
    excludeFolders: excludeCsv.split(',').map(s => s.trim()).filter(Boolean),
    skipExtensions: DEFAULT_CONFIG.scan.skipExtensions,
    ocrExtensions: DEFAULT_CONFIG.scan.ocrExtensions,
    videoExtensions: DEFAULT_CONFIG.scan.videoExtensions,
  };
}

async function askProvider(): Promise<'ollama' | 'anthropic' | 'openai'> {
  return select<'ollama' | 'anthropic' | 'openai'>({
    message: 'Gdzie ma działać LLM?',
    choices: [
      { name: 'Lokalnie (Ollama) — 100% offline, wolniejsze', value: 'ollama' },
      { name: 'Anthropic Claude — szybkie, wysyła OCR do API', value: 'anthropic' },
      { name: 'OpenAI — szybkie, wysyła OCR do API', value: 'openai' },
    ],
  });
}

async function askOllamaModel(): Promise<{ model: string; ollamaUrl: string }> {
  const ollamaUrl = await input({
    message: 'Adres Ollama:',
    default: DEFAULT_CONFIG.llm.ollamaUrl,
  });

  const spin = ora('Sprawdzam Ollamę…').start();
  const probe = await probeOllama(ollamaUrl);
  if (!probe.reachable) {
    spin.warn(`Ollama nieosiągalna: ${probe.error ?? 'brak odpowiedzi'}`);
    const proceed = await confirm({
      message: 'Kontynuować mimo wszystko? (możesz uruchomić `ollama serve` później)',
      default: true,
    });
    if (!proceed) throw new Error('Anulowano przez użytkownika');
    const model = await input({
      message: 'Model Ollamy (np. mistral-nemo):',
      default: DEFAULT_CONFIG.llm.model,
    });
    return { model, ollamaUrl };
  }
  spin.succeed(`Ollama OK — znaleziono ${probe.models.length} modeli`);

  if (probe.models.length === 0) {
    process.stdout.write(chalk.yellow('\n⚠️  Brak zainstalowanych modeli. Sugerowane:\n'));
    for (const s of SUGGESTED_OLLAMA_MODELS) {
      process.stdout.write(`   ${chalk.cyan(`ollama pull ${s.name}`)}  — ${s.note}\n`);
    }
    process.stdout.write('\n');
    const model = await input({
      message: 'Model którego użyjesz (wpisz nazwę):',
      default: 'mistral-nemo',
    });
    return { model, ollamaUrl };
  }

  const isEmbedding = (name: string) => /embed/i.test(name);
  const usable = probe.models.filter(m => !isEmbedding(m.name));
  const embedders = probe.models.filter(m => isEmbedding(m.name));
  const choices = [
    ...usable.map(m => ({
      name: `${m.name}  ${chalk.gray('(' + modelSizeLabel(m.size) + ')')}`,
      value: m.name,
    })),
    ...embedders.map(m => ({
      name: `${m.name}  ${chalk.gray('(' + modelSizeLabel(m.size) + ') — embedding, nie do tagowania')}`,
      value: m.name,
    })),
    { name: chalk.gray('— wpisz inny —'), value: '__custom__' },
  ];
  const picked = await select<string>({
    message: 'Wybierz model Ollamy:',
    choices,
  });
  const model = picked === '__custom__'
    ? await input({ message: 'Nazwa modelu:', default: 'mistral-nemo' })
    : picked;

  const smallNames = ['llama3.1', 'llama3', 'phi', 'gemma:2b', 'mistral', 'tinyllama'];
  if (smallNames.some(s => model.toLowerCase().includes(s))) {
    process.stdout.write(chalk.yellow(
      '\n⚠️  Mały model — wygenerowana taksonomia może być szorstka.\n' +
      '   Możesz później użyć trybu cloud do init, a Ollamy do tagowania.\n\n',
    ));
  }

  return { model, ollamaUrl };
}

async function askCloud(provider: 'anthropic' | 'openai', existingKey?: string): Promise<{ model: string; apiKey: string }> {
  const envKey = provider === 'anthropic' ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY;
  let apiKey = existingKey ?? envKey ?? '';
  if (!apiKey) {
    apiKey = await password({
      message: `Klucz API ${provider} (zostanie zapisany w configu):`,
      mask: '*',
    });
  } else {
    process.stdout.write(chalk.gray(`   Klucz API wykryty z env: ${apiKey.slice(0, 8)}…\n`));
  }
  const model = await select<string>({
    message: `Model ${provider}:`,
    choices: CLOUD_MODELS[provider].map(m => ({ name: m.label, value: m.name })),
  });
  return { model, apiKey };
}

async function askMask(): Promise<Config['mask']> {
  const enabled = await confirm({
    message: 'Włączyć pseudonimizację PII (pseudonym-mcp) przed wysyłką do cloud?',
    default: false,
  });
  if (!enabled) return { enabled: false, lang: 'pl' };
  const lang = await select<LanguageCode>({
    message: 'Język danych (dla regułek pseudonimizacji):',
    choices: [
      { name: 'Polski', value: 'pl' },
      { name: 'English', value: 'en' },
    ],
  });
  return { enabled: true, lang };
}

async function askContext(): Promise<string> {
  process.stdout.write(chalk.gray(
    'Krótki opis siebie/branży/aktualnych spraw. LLM użyje tego jako tła przy tagowaniu.\n' +
    'Przykład: "Freelancer-projektant w Warszawie. Klienci: AcmeCorp. Aktualne: rozliczenia 2024."\n',
  ));
  return input({
    message: 'Kontekst (możesz pominąć, edytujesz później):',
    default: '',
  });
}

async function askFreeForm(): Promise<boolean> {
  return confirm({
    message: 'Pozwolić LLM-owi proponować NOWE tagi (free-form)? Pokażę je w podsumowaniu.',
    default: false,
  });
}

async function askOrganize(allowed: string[]): Promise<OrganizeConfig> {
  const target = await input({
    message: 'Folder docelowy dla sortowania:',
    default: DEFAULT_ORGANIZE.target,
  });
  const strategy = await select<'flat' | 'nested' | 'custom'>({
    message: 'Strategia układu folderów:',
    choices: [
      { name: 'Flat — jeden folder per tag (Faktura/, Bank/)', value: 'flat' },
      { name: 'Nested — priorytet wygrywa, plik trafia tylko do jednego folderu', value: 'nested' },
      { name: 'Custom — niestandardowe mapowanie tag→folder', value: 'custom' },
    ],
  });
  const unsorted = await select<'keep' | 'move' | 'skip'>({
    message: 'Co z plikami bez tagów?',
    choices: [
      { name: 'Przenieś do _unsorted/', value: 'move' },
      { name: 'Zostaw w miejscu', value: 'keep' },
      { name: 'Pomiń całkowicie', value: 'skip' },
    ],
  });
  return {
    enabled: true,
    target,
    strategy,
    priority: allowed,
    folderMap: {},
    unsorted,
    unsortedFolder: '_unsorted',
    multiTag: 'primary',
  };
}

async function runDiscoverySampling(
  scan: Config['scan'],
  count: number,
): Promise<{ files: string[]; samples: SampledFile[]; cfgBase: Config }> {
  const cfgBase: Config = { ...DEFAULT_CONFIG, scan };
  const root = path.resolve(expandHome(scan.folder));
  if (!existsSync(root)) throw new Error(`Folder nie istnieje: ${root}`);
  const files = await pickSampleFiles(root, cfgBase, { count, ocrEligibleOnly: true });
  if (files.length === 0) {
    throw new Error(`Brak plików do OCR w ${root}. Sprawdź rozszerzenia / wykluczenia.`);
  }
  const spin = ora(`OCR próbki (${files.length} plików)…`).start();
  const samples = await ocrSamples(files, cfgBase, (done, total, file) => {
    spin.text = `OCR ${done}/${total}: ${file ? path.basename(file) : ''}`;
  });
  spin.succeed(`OCR gotowy: ${samples.length} plików`);
  return { files, samples, cfgBase };
}

export async function runWizard(opts: WizardOptions): Promise<WizardResult> {
  process.stdout.write(chalk.bold.cyan('\n✨ sortai — interaktywny wizard\n\n'));

  const mode = await askMode();

  process.stdout.write('\n' + chalk.bold('📁 Folder\n'));
  const scan = await askScan(opts.folderHint ?? DEFAULT_CONFIG.scan.folder);

  let provider: Config['llm']['provider'] = DEFAULT_CONFIG.llm.provider;
  let model: string = DEFAULT_CONFIG.llm.model;
  let ollamaUrl: string = DEFAULT_CONFIG.llm.ollamaUrl;
  let apiKey: string | undefined;
  let mask: Config['mask'] = { ...DEFAULT_CONFIG.mask };

  const needsLlm = mode === 'tag' || mode === 'tag+organize' || mode === 'discovery';
  if (needsLlm) {
    process.stdout.write('\n' + chalk.bold('🧠 LLM\n'));
    provider = await askProvider();
    if (provider === 'ollama') {
      const o = await askOllamaModel();
      model = o.model;
      ollamaUrl = o.ollamaUrl;
    } else {
      const c = await askCloud(provider, opts.apiKey);
      model = c.model;
      apiKey = c.apiKey || undefined;
      mask = await askMask();
    }
  }

  process.stdout.write('\n' + chalk.bold('💬 Kontekst\n'));
  const context = needsLlm ? await askContext() : DEFAULT_CONFIG.context;
  const freeForm = needsLlm ? await askFreeForm() : false;

  let cfg: Config = {
    ...DEFAULT_CONFIG,
    scan,
    llm: {
      provider,
      model,
      temperature: DEFAULT_CONFIG.llm.temperature,
      numPredict: DEFAULT_CONFIG.llm.numPredict,
      ollamaUrl,
      apiKey,
    },
    mask,
    tags: { ...DEFAULT_CONFIG.tags, freeForm },
    organize: { ...DEFAULT_ORGANIZE },
    context: context || DEFAULT_CONFIG.context,
  };

  const wantsTaxonomy = needsLlm && (mode === 'tag' || mode === 'tag+organize' || mode === 'discovery');
  if (wantsTaxonomy) {
    process.stdout.write('\n' + chalk.bold('🔬 Próbkowanie\n'));
    const sampleCount = Number(await input({
      message: 'Ile plików zsamplować do generacji taksonomii?',
      default: '30',
      validate: v => /^\d+$/.test(v) && Number(v) > 0 ? true : 'Liczba dodatnia',
    }));

    let sampling: Awaited<ReturnType<typeof runDiscoverySampling>>;
    try {
      sampling = await runDiscoverySampling(scan, sampleCount);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stdout.write(chalk.red(`\nProblem z próbkowaniem: ${msg}\n`));
      process.stdout.write(chalk.yellow('Zapisuję config bez taksonomii — uzupełnisz po dograniu plików.\n\n'));
      return finalize(cfg, opts, mode);
    }
    const { samples } = sampling;

    const lang = detectLanguages(samples.map(s => s.ocrText));
    const langs = languageList(lang);
    process.stdout.write(chalk.gray(
      `   Wykryty język: ${langs.join(' + ')} ` +
      `(PL ${(lang.scores.pl * 100).toFixed(0)}% / EN ${(lang.scores.en * 100).toFixed(0)}%)\n`,
    ));

    process.stdout.write('\n' + chalk.bold('🪄 Generacja taksonomii (LLM)\n'));
    const taxSpin = ora(`Pytam ${provider}:${model} o taksonomię…`).start();
    let taxonomy;
    try {
      taxonomy = await generateTaxonomy(samples, langs, cfg.context, cfg);
      taxSpin.succeed(`Wygenerowano ${taxonomy.categories.length} kategorii`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      taxSpin.fail(`Nieudane: ${msg}`);
      process.stdout.write(chalk.yellow('Zapisuję config z domyślną taksonomią.\n\n'));
      return finalize(cfg, opts, mode);
    }

    if (provider === 'ollama') {
      process.stdout.write(chalk.yellow(
        '\n⚠️  To DRAFT z lokalnego modelu — przejrzyj kategorie i popraw co trzeba.\n',
      ));
    }

    if (mode !== 'discovery') {
      taxonomy = await refineTaxonomyLoop(taxonomy, {
        samples,
        langs,
        userContext: cfg.context,
        baseCfg: cfg,
      });
      cfg = applyTaxonomyToConfig(taxonomy, cfg);
    } else {
      process.stdout.write('\n' + chalk.bold('🔎 Discovery — proponowana taksonomia:\n\n'));
      process.stdout.write(renderTaxonomyTable(taxonomy) + '\n');
      const save = await confirm({ message: 'Zapisać tę taksonomię do configu?', default: false });
      if (save) cfg = applyTaxonomyToConfig(taxonomy, cfg);
    }
  }

  if (mode === 'organize' || mode === 'tag+organize') {
    process.stdout.write('\n' + chalk.bold('📂 Sortowanie\n'));
    cfg.organize = await askOrganize(cfg.tags.allowed);
  }

  return finalize(cfg, opts, mode);
}

async function finalize(cfg: Config, opts: WizardOptions, mode: WizardMode): Promise<WizardResult> {
  process.stdout.write('\n' + chalk.bold('💾 Zapis\n'));
  const cfgPath = resolveConfigPath(opts.configPath);
  const exists = existsSync(cfgPath);
  if (exists) {
    process.stdout.write(chalk.gray(`   Istniejący config zostanie zarchiwizowany: ${cfgPath}.bak.*\n`));
  }
  const savedPath = await saveConfig(cfg, opts.configPath);
  process.stdout.write(chalk.green(`   ✓ Zapisano ${savedPath}\n`));

  let shouldRunTag = false;
  let shouldRunOrganize = false;
  if (mode !== 'discovery') {
    const runNow = await confirm({
      message: mode === 'tag+organize'
        ? 'Uruchomić teraz tagowanie + sortowanie?'
        : mode === 'organize'
          ? 'Uruchomić teraz sortowanie?'
          : 'Uruchomić teraz tagowanie?',
      default: false,
    });
    if (runNow) {
      shouldRunTag = mode === 'tag' || mode === 'tag+organize';
      shouldRunOrganize = mode === 'organize' || mode === 'tag+organize';
    } else {
      process.stdout.write(chalk.gray('\nMożesz uruchomić później:\n'));
      if (mode === 'tag' || mode === 'tag+organize') {
        process.stdout.write(`   ${chalk.cyan(`sortai tag ${cfg.scan.folder}`)}\n`);
      }
      if (mode === 'organize' || mode === 'tag+organize') {
        process.stdout.write(`   ${chalk.cyan(`sortai organize ${cfg.scan.folder} --apply`)}\n`);
      }
    }
  }

  return { config: cfg, configPath: savedPath, mode, shouldRunTag, shouldRunOrganize };
}
