import chalk from 'chalk';
import { runWizard } from '../wizard/index.js';
import { tagCommand } from './tag.js';
import { organizeCommand } from './organize.js';

export interface InitCliOptions {
  config?: string;
  apiKey?: string;
}

export async function initCommand(folder: string | undefined, opts: InitCliOptions): Promise<void> {
  const result = await runWizard({
    configPath: opts.config,
    apiKey: opts.apiKey,
    folderHint: folder,
  });

  if (result.shouldRunTag) {
    process.stdout.write('\n' + chalk.bold.cyan('▶ Tagowanie\n\n'));
    await tagCommand(result.config.scan.folder, {
      config: opts.config,
      dryRun: false,
      verbose: false,
      skipTagged: false,
      dedup: result.config.dedup.enabled,
      mask: result.config.mask.enabled,
      free: result.config.tags.freeForm,
    });
  }
  if (result.shouldRunOrganize) {
    process.stdout.write('\n' + chalk.bold.cyan('▶ Sortowanie\n\n'));
    await organizeCommand(result.config.scan.folder, {
      config: opts.config,
      apply: true,
      dryRun: false,
      verbose: false,
    });
  }
}
