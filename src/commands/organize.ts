import path from 'node:path';
import { existsSync } from 'node:fs';
import chalk from 'chalk';
import ora from 'ora';
import { expandHome, loadConfig, configExists } from '../config.js';
import { buildOrganizePlan, type OrganizePlan } from '../organize/plan.js';
import { executeMove } from '../organize/move.js';
import { runWizard } from '../wizard/index.js';

export interface OrganizeCliOptions {
  config?: string;
  target?: string;
  dryRun?: boolean;
  apply?: boolean;
  verbose?: boolean;
}

function renderPlan(plan: OrganizePlan, root: string): void {
  process.stdout.write(chalk.bold(`📋 Plan przenoszenia (${plan.moves.length} plików):\n\n`));
  const maxShow = 50;
  for (const m of plan.moves.slice(0, maxShow)) {
    const from = path.relative(root, m.from);
    const to = m.to;
    const tag = m.primaryTag ? chalk.cyan(` [${m.primaryTag}]`) : chalk.gray(' [_unsorted]');
    process.stdout.write(`  ${from}\n    → ${to}${tag}\n`);
  }
  if (plan.moves.length > maxShow) {
    process.stdout.write(chalk.gray(`  … i ${plan.moves.length - maxShow} więcej\n`));
  }
  if (plan.skips.length > 0) {
    process.stdout.write('\n' + chalk.gray(`Pominięte (${plan.skips.length}):\n`));
    for (const s of plan.skips.slice(0, 10)) {
      process.stdout.write(chalk.gray(`  ${path.relative(root, s.path)} — ${s.reason}\n`));
    }
    if (plan.skips.length > 10) {
      process.stdout.write(chalk.gray(`  … i ${plan.skips.length - 10} więcej\n`));
    }
  }
  if (plan.conflicts > 0) {
    process.stdout.write('\n' + chalk.yellow(`⚠️  ${plan.conflicts} konfliktów nazw — dodano sufiksy _2, _3 itd.\n`));
  }
}

export async function organizeCommand(folder: string | undefined, opts: OrganizeCliOptions): Promise<void> {
  if (!(await configExists(opts.config))) {
    process.stdout.write(chalk.cyan('🪄 Brak configu — uruchamiam wizard…\n\n'));
    await runWizard({ configPath: opts.config, folderHint: folder });
    return;
  }

  const { config } = await loadConfig(opts.config);
  const cfg = opts.target
    ? { ...config, organize: { ...config.organize, target: opts.target, enabled: true } }
    : config;

  const root = path.resolve(expandHome(folder ?? cfg.scan.folder));
  if (!existsSync(root)) {
    process.stderr.write(chalk.red(`Folder nie istnieje: ${root}\n`));
    process.exit(1);
  }

  process.stdout.write(chalk.cyan(`📂 Sortowanie ${root} → ${expandHome(cfg.organize.target)}\n`));
  process.stdout.write(chalk.gray(`   Strategia: ${cfg.organize.strategy}, brak tagów: ${cfg.organize.unsorted}\n\n`));

  const spin = ora('Czytam tagi i buduję plan…').start();
  let plan: OrganizePlan;
  try {
    plan = await buildOrganizePlan(root, cfg);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    spin.fail(`Plan failed: ${msg}`);
    process.exit(1);
  }
  spin.succeed(`Plan: ${plan.moves.length} przenosin, ${plan.skips.length} pominięć`);

  renderPlan(plan, root);

  if (!opts.apply || opts.dryRun) {
    process.stdout.write('\n' + chalk.yellow('🔍 Dry-run — żadne pliki nie zostały przeniesione.\n'));
    process.stdout.write(chalk.gray('   Uruchom z --apply żeby wykonać.\n'));
    return;
  }

  if (plan.moves.length === 0) {
    process.stdout.write('\n' + chalk.gray('Nic do przenoszenia.\n'));
    return;
  }

  process.stdout.write('\n' + chalk.bold('🚚 Wykonuję przenoszenia…\n'));
  let ok = 0;
  let errors = 0;
  for (const m of plan.moves) {
    try {
      await executeMove(m);
      ok++;
      if (opts.verbose) process.stdout.write(chalk.gray(`  ✓ ${path.basename(m.from)}\n`));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stdout.write(chalk.red(`  ✗ ${path.basename(m.from)}: ${msg}\n`));
      errors++;
    }
  }
  process.stdout.write('\n' + chalk.bold('✨ Done\n'));
  process.stdout.write(chalk.green(`   ✓ Przeniesione: ${ok}\n`));
  if (errors) process.stdout.write(chalk.red(`   ✗ Błędy:        ${errors}\n`));
}
