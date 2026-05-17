#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { expandHome, loadConfig } from './config.js';
import { walkFiles } from './walker.js';
import { extractOcrText } from './ocr.js';
import { preTagFromPath } from './pretag.js';
import { mergeTags } from './tags.js';
import { writeFileMetadata } from './macos.js';
import { Masker } from './mask.js';
import { inferTagsAndComment } from './llm/index.js';
import type { Config, ProcessStats } from './types.js';

interface CliOptions {
  config?: string;
  dryRun: boolean;
  model?: string;
  ollamaUrl?: string;
  cloud?: 'anthropic' | 'openai';
  apiKey?: string;
  mask: boolean;
  lang?: 'en' | 'pl';
  exclude?: string;
  verbose: boolean;
}

function applyOverrides(cfg: Config, opts: CliOptions): Config {
  const apiKey = opts.apiKey
    ?? process.env.SORTAI_API_KEY
    ?? (opts.cloud === 'anthropic' ? process.env.ANTHROPIC_API_KEY : undefined)
    ?? (opts.cloud === 'openai' ? process.env.OPENAI_API_KEY : undefined);

  const provider: Config['llm']['provider'] = opts.cloud ?? 'ollama';

  const defaultCloudModels: Record<string, string> = {
    anthropic: 'claude-sonnet-4-6',
    openai: 'gpt-4o-mini',
  };

  return {
    ...cfg,
    scan: {
      ...cfg.scan,
      excludeFolders: opts.exclude
        ? opts.exclude.split(',').map(s => s.trim()).filter(Boolean)
        : cfg.scan.excludeFolders,
    },
    llm: {
      ...cfg.llm,
      provider,
      model: opts.model ?? (opts.cloud ? defaultCloudModels[opts.cloud] ?? cfg.llm.model : cfg.llm.model),
      ollamaUrl: opts.ollamaUrl ?? cfg.llm.ollamaUrl,
      apiKey,
    },
    mask: {
      ...cfg.mask,
      enabled: opts.mask,
      lang: opts.lang ?? cfg.mask.lang,
    },
  };
}

async function main(): Promise<void> {
  const program = new Command();
  program
    .name('sortai')
    .description('macOS CLI that tags files based on OCR + LLM-inferred Finder tags & comments')
    .version('0.1.0')
    .argument('[folder]', 'folder to scan (overrides config.scan.folder)')
    .option('--config <path>', 'path to config JSON (default: ~/.config/sortai/config.json)')
    .option('--dry-run', 'do not write tags/comments; just log', false)
    .option('--model <name>', 'LLM model name (default depends on provider)')
    .option('--ollama-url <url>', 'Ollama base URL (default: http://localhost:11434)')
    .option('--cloud <provider>', "use a cloud LLM: 'anthropic' or 'openai'")
    .option('--api-key <key>', 'API key for cloud provider (or env SORTAI_API_KEY / ANTHROPIC_API_KEY / OPENAI_API_KEY)')
    .option('--mask', 'pseudonymise OCR via pseudonym-mcp before sending to cloud LLM', false)
    .option('--lang <code>', "pseudonym-mcp language: 'en' | 'pl' (default: pl)")
    .option('--exclude <patterns>', 'comma-separated folder names to skip (overrides config)')
    .option('--verbose', 'extra logs', false)
    .parse(process.argv);

  const opts = program.opts<CliOptions>();
  const folderArg = program.args[0];

  if (opts.cloud && !['anthropic', 'openai'].includes(opts.cloud)) {
    process.stderr.write(chalk.red(`Unknown --cloud provider: ${opts.cloud}\n`));
    process.exit(1);
  }
  if (opts.mask && !opts.cloud) {
    process.stderr.write(chalk.yellow('⚠️  --mask without --cloud is a no-op (local Ollama already keeps data offline).\n'));
  }

  let configResult: Awaited<ReturnType<typeof loadConfig>>;
  try {
    configResult = await loadConfig(opts.config);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(chalk.red(`Config error: ${msg}\n`));
    process.exit(1);
  }

  if (configResult.created) {
    process.stdout.write(chalk.green(`✨ Created default config at ${configResult.path}\n`));
    process.stdout.write('   Edit it to customise tags, then re-run.\n');
    return;
  }

  const cfg = applyOverrides(configResult.config, opts);

  if (cfg.llm.provider !== 'ollama' && !cfg.llm.apiKey) {
    process.stderr.write(chalk.red(`Missing API key for ${cfg.llm.provider}. Pass --api-key or set the env var.\n`));
    process.exit(1);
  }

  const rawFolder = folderArg ?? cfg.scan.folder;
  const root = path.resolve(expandHome(rawFolder));
  if (!existsSync(root)) {
    process.stderr.write(chalk.red(`Folder does not exist: ${root}\n`));
    process.exit(1);
  }

  let masker: Masker | undefined;
  if (cfg.mask.enabled && cfg.llm.provider !== 'ollama') {
    masker = new Masker(cfg);
    const spin = ora('Starting pseudonym-mcp…').start();
    try {
      await masker.connect();
      spin.succeed('pseudonym-mcp ready');
    } catch (err) {
      spin.fail(err instanceof Error ? err.message : String(err));
      masker = undefined;
    }
  }

  process.stdout.write(chalk.cyan(`🚀 Scanning ${root}\n`));
  process.stdout.write(`   Provider: ${cfg.llm.provider} (${cfg.llm.model})`);
  if (cfg.mask.enabled && masker) process.stdout.write(chalk.gray(' [masked]'));
  if (opts.dryRun) process.stdout.write(chalk.yellow(' [dry-run]'));
  process.stdout.write('\n');
  if (cfg.scan.excludeFolders.length) {
    process.stdout.write(chalk.gray(`   Excluded: ${cfg.scan.excludeFolders.join(', ')}\n`));
  }
  process.stdout.write('\n');

  const allFiles = await walkFiles(root, cfg);
  process.stdout.write(`📁 Files: ${allFiles.length}\n\n`);

  const stats: ProcessStats = { ok: 0, preOnly: 0, skipped: 0, errors: 0, total: allFiles.length };
  const skipExt = new Set(cfg.scan.skipExtensions);
  const ocrExt = new Set(cfg.scan.ocrExtensions);
  const videoExt = new Set(cfg.scan.videoExtensions);

  for (const filePath of allFiles) {
    const rel = path.relative(root, filePath);
    const name = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();

    if (skipExt.has(ext)) {
      stats.skipped++;
      continue;
    }

    process.stdout.write(chalk.bold(`🔍 ${rel}\n`));

    let ocrText = '';
    if (ocrExt.has(ext)) {
      process.stdout.write('  📖 OCR…');
      ocrText = await extractOcrText(filePath, cfg);
      const words = ocrText.split(/\s+/).filter(Boolean).length;
      process.stdout.write(` ${words} words\n`);
    } else if (videoExt.has(ext)) {
      process.stdout.write('  🎬 Video\n');
    } else {
      process.stdout.write(`  📄 ${ext}\n`);
    }

    const preTags = preTagFromPath(filePath, ocrText, cfg);

    let finalTags: string[];
    let finalComment: string;

    if (preTags.length >= 4 && !ocrText.trim()) {
      finalTags = mergeTags(cfg, preTags, [cfg.tags.autoTag]);
      finalComment = `Auto z nazwy/ścieżki: ${name}.`;
      process.stdout.write(chalk.gray(`  ⚡ Pre-only: ${preTags.join(' ')}\n`));
      stats.preOnly++;
    } else {
      process.stdout.write(chalk.gray(`  🧠 ${cfg.llm.provider}…\n`));
      const result = await inferTagsAndComment(
        { fileName: name, ext, preTags, ocrText },
        cfg,
        masker,
      );
      finalTags = mergeTags(cfg, result.tags, [cfg.tags.autoTag]);
      finalComment = result.comment || `Plik: ${name}.`;
    }

    if (opts.dryRun) {
      process.stdout.write(chalk.green(`  ✅ ${finalTags.join(' ')}\n`));
      process.stdout.write(chalk.gray(`  📝 ${finalComment}\n\n`));
      stats.ok++;
      continue;
    }

    try {
      await writeFileMetadata(filePath, finalTags, finalComment);
      process.stdout.write(chalk.green(`  ✅ ${finalTags.join(' ')}\n`));
      process.stdout.write(chalk.gray(`  📝 ${finalComment}\n\n`));
      stats.ok++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stdout.write(chalk.red(`  ❌ Write failed: ${msg}\n\n`));
      stats.errors++;
    }
  }

  if (masker) await masker.close();

  process.stdout.write('═══════════════════════════════════════════════════════\n');
  process.stdout.write(chalk.bold('✨ Done\n'));
  process.stdout.write(chalk.green(`   ✅ Success:       ${stats.ok}\n`));
  process.stdout.write(chalk.gray(`   ⚡ Pre-only:       ${stats.preOnly}\n`));
  process.stdout.write(chalk.gray(`   ⏭  Skipped:       ${stats.skipped}\n`));
  process.stdout.write(chalk.red(`   ❌ Errors:        ${stats.errors}\n`));
}

main().catch(err => {
  process.stderr.write(chalk.red(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`));
  process.exit(1);
});
