import path from 'node:path';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import chalk from 'chalk';
import { expandHome, loadConfig, configExists } from '../config.js';
import { walkFiles } from '../walker.js';
import { clearMacosMetadata } from '../macos.js';
import { runWizard } from '../wizard/index.js';

const execFileAsync = promisify(execFile);

export interface ClearCliOptions {
  config?: string;
  dryRun?: boolean;
  verbose?: boolean;
}

export async function clearCommand(folder: string | undefined, opts: ClearCliOptions): Promise<void> {
  if (!(await configExists(opts.config))) {
    process.stdout.write(chalk.cyan('🪄 Brak configu — uruchamiam wizard…\n\n'));
    await runWizard({ configPath: opts.config, folderHint: folder });
    return;
  }

  const { config: cfg } = await loadConfig(opts.config);
  const rawFolder = folder ?? cfg.scan.folder;
  const root = path.resolve(expandHome(rawFolder));
  if (!existsSync(root)) {
    process.stderr.write(chalk.red(`Folder nie istnieje: ${root}\n`));
    process.exit(1);
  }

  process.stdout.write(chalk.cyan(`🧹 Clearing sortai metadata from ${root}\n`));
  if (opts.dryRun) process.stdout.write(chalk.yellow('   [dry-run — no changes will be written]\n'));
  process.stdout.write('\n');

  const files = await walkFiles(root, cfg);
  let cleared = 0;
  let errors = 0;
  for (const filePath of files) {
    const rel = path.relative(root, filePath);
    if (opts.dryRun) {
      process.stdout.write(chalk.gray(`  🗑  ${rel}\n`));
      cleared++;
      continue;
    }
    try {
      await clearMacosMetadata(filePath);
      execFileAsync('mdimport', [filePath]).catch(() => {});
      if (opts.verbose) process.stdout.write(chalk.gray(`  🗑  ${rel}\n`));
      cleared++;
    } catch {
      process.stdout.write(chalk.red(`  ❌ ${rel}\n`));
      errors++;
    }
  }

  process.stdout.write('═══════════════════════════════════════════════════════\n');
  process.stdout.write(chalk.bold('✨ Done\n'));
  process.stdout.write(chalk.green(`   🗑  Cleared: ${cleared}\n`));
  if (errors) process.stdout.write(chalk.red(`   ❌ Errors:  ${errors}\n`));
}
