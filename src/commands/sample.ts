import path from 'node:path';
import { existsSync } from 'node:fs';
import chalk from 'chalk';
import ora from 'ora';
import { expandHome, loadConfig, configExists } from '../config.js';
import { preTagFromPath } from '../pretag.js';
import { mergeTags } from '../tags.js';
import { inferTagsAndComment } from '../llm/index.js';
import { pickSampleFiles, ocrSamples } from '../wizard/sample.js';
import { runWizard } from '../wizard/index.js';

export interface SampleCliOptions {
  config?: string;
  count?: number;
  verbose?: boolean;
}

export async function sampleCommand(folder: string | undefined, opts: SampleCliOptions): Promise<void> {
  if (!(await configExists(opts.config))) {
    process.stdout.write(chalk.cyan('🪄 Brak configu — uruchamiam wizard…\n\n'));
    await runWizard({ configPath: opts.config, folderHint: folder });
    return;
  }

  const { config: cfg } = await loadConfig(opts.config);
  const root = path.resolve(expandHome(folder ?? cfg.scan.folder));
  if (!existsSync(root)) {
    process.stderr.write(chalk.red(`Folder nie istnieje: ${root}\n`));
    process.exit(1);
  }

  const n = opts.count ?? 20;
  const files = await pickSampleFiles(root, cfg, { count: n, ocrEligibleOnly: true });
  if (files.length === 0) {
    process.stdout.write(chalk.yellow('Brak plików do próbkowania.\n'));
    return;
  }

  const spin = ora(`OCR ${files.length} próbek…`).start();
  const samples = await ocrSamples(files, cfg, (done, total) => {
    spin.text = `OCR ${done}/${total}`;
  });
  spin.succeed('OCR gotowy');

  let ok = 0;
  let weak = 0;
  for (const s of samples) {
    process.stdout.write(chalk.bold(`\n${s.name}\n`));
    const preTags = preTagFromPath(s.path, s.ocrText, cfg);
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
    const meaningful = tags.filter(t => t !== cfg.tags.autoTag);
    const color = meaningful.length >= 2 ? chalk.green : meaningful.length === 1 ? chalk.yellow : chalk.red;
    if (meaningful.length >= 1) ok++; else weak++;
    process.stdout.write(color(`  ${tags.join(' ') || '(brak)'}\n`));
    process.stdout.write(chalk.gray(`  ${comment}\n`));
  }

  process.stdout.write('\n');
  process.stdout.write(chalk.bold('✨ Sample done\n'));
  process.stdout.write(chalk.green(`   ✓ Otagowane:    ${ok}\n`));
  process.stdout.write(chalk.red(`   ⚠ Słabe:        ${weak}\n`));
}
