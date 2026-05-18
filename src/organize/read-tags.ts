import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function readMacosTags(filePath: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync('mdls', ['-name', 'kMDItemUserTags', '-raw', filePath], { timeout: 3_000 });
    const trimmed = stdout.trim();
    if (!trimmed || trimmed === '(null)') return [];
    const matches = [...trimmed.matchAll(/"((?:[^"\\]|\\.)*?)"/g)];
    return matches
      .map(m => m[1].split('\n')[0])
      .filter(t => t.startsWith('#'));
  } catch {
    return [];
  }
}
