#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { initCommand } from './commands/init.js';
import { tagCommand } from './commands/tag.js';
import { organizeCommand } from './commands/organize.js';
import { clearCommand } from './commands/clear.js';
import { sampleCommand } from './commands/sample.js';

async function main(): Promise<void> {
  const program = new Command();
  program
    .name('sortai')
    .description('macOS CLI: OCR + LLM → Finder tags, komentarze i sortowanie do folderów')
    .version('0.2.0');

  program
    .command('init [folder]')
    .description('Interaktywny wizard: zbuduj config z Twoich plików')
    .option('--config <path>', 'ścieżka do configu')
    .option('--api-key <key>', 'klucz API (cloud)')
    .action((folder, opts) => initCommand(folder, opts));

  program
    .command('tag [folder]', { isDefault: true })
    .description('Otaguj pliki (Finder tagi + komentarze) — akcja domyślna')
    .option('--config <path>', 'ścieżka do configu')
    .option('--dry-run', 'podgląd bez zapisu', false)
    .option('--model <name>', 'nazwa modelu LLM')
    .option('--ollama-url <url>', 'Ollama base URL')
    .option('--cloud <provider>', "'anthropic' | 'openai'")
    .option('--api-key <key>', 'klucz API')
    .option('--mask', 'pseudonimizuj OCR przed wysyłką do cloud', false)
    .option('--lang <code>', "'en' | 'pl'")
    .option('--exclude <patterns>', 'CSV — katalogi do pominięcia')
    .option('--limit <n>', 'max plików', v => parseInt(v, 10))
    .option('--skip-tagged', 'pomiń pliki z auto-tagiem', false)
    .option('--no-dedup', 'pomiń detekcję duplikatów')
    .option('--free', 'pozwól LLM-owi proponować nowe tagi (free-form)', false)
    .option('--verbose', 'więcej logów', false)
    .action((folder, opts) => tagCommand(folder, opts));

  program
    .command('organize [folder]')
    .description('Przenieś pliki do folderów na bazie ich Finder tagów')
    .option('--config <path>', 'ścieżka do configu')
    .option('--target <path>', 'folder docelowy (nadpisuje config)')
    .option('--dry-run', 'pokaż plan, nie przenoś', false)
    .option('--apply', 'wykonaj przenoszenia (default = dry-run)', false)
    .option('--verbose', 'więcej logów', false)
    .action((folder, opts) => organizeCommand(folder, opts));

  program
    .command('clear [folder]')
    .description('Wyczyść wszystkie sortai tagi i komentarze z plików')
    .option('--config <path>', 'ścieżka do configu')
    .option('--dry-run', 'podgląd bez kasowania', false)
    .option('--verbose', 'więcej logów', false)
    .action((folder, opts) => clearCommand(folder, opts));

  program
    .command('sample [folder]')
    .description('Uruchom pełen pipeline na N losowych plikach (dry-run)')
    .option('--config <path>', 'ścieżka do configu')
    .option('-n, --count <count>', 'ile plików', v => parseInt(v, 10), 20)
    .option('--verbose', 'więcej logów', false)
    .action((folder, opts) => sampleCommand(folder, opts));

  await program.parseAsync(process.argv);
}

main().catch(err => {
  if (err instanceof Error && (err.name === 'ExitPromptError' || err.message.includes('force closed'))) {
    process.stdout.write(chalk.yellow('\nAnulowano.\n'));
    process.exit(130);
  }
  process.stderr.write(chalk.red(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`));
  process.exit(1);
});
