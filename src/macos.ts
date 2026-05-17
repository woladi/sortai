import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);

function escapeAppleScriptString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function runOsa(lines: string[]): Promise<void> {
  const args: string[] = [];
  for (const line of lines) {
    args.push('-e', line);
  }
  await execFileAsync('osascript', args, { timeout: 10_000 });
}

export async function clearMacosMetadata(filePath: string): Promise<void> {
  const abs = path.resolve(filePath);
  const escaped = escapeAppleScriptString(abs);
  try {
    await runOsa([
      `set theFile to (POSIX file "${escaped}" as alias)`,
      'tell application "Finder"',
      'set tags of theFile to {}',
      'set comment of theFile to ""',
      'end tell',
    ]);
  } catch {
    // best-effort clear; ignore failures
  }
}

export async function setMacosTags(filePath: string, tags: string[]): Promise<void> {
  const abs = path.resolve(filePath);
  const escapedPath = escapeAppleScriptString(abs);
  const tagList = tags.map(t => `"${escapeAppleScriptString(t)}"`).join(', ');
  await runOsa([
    `set theFile to (POSIX file "${escapedPath}" as alias)`,
    'tell application "Finder"',
    `set tags of theFile to {${tagList}}`,
    'end tell',
  ]);
}

export async function setFinderComment(filePath: string, comment: string): Promise<void> {
  const abs = path.resolve(filePath);
  const escapedPath = escapeAppleScriptString(abs);
  const truncated = comment.slice(0, 500);
  const escapedComment = escapeAppleScriptString(truncated);
  await runOsa([
    `set theFile to (POSIX file "${escapedPath}" as alias)`,
    'tell application "Finder"',
    `set comment of theFile to "${escapedComment}"`,
    'end tell',
  ]);
}

export async function writeFileMetadata(
  filePath: string,
  tags: string[],
  comment: string,
): Promise<void> {
  await clearMacosMetadata(filePath);
  await setMacosTags(filePath, tags);
  await setFinderComment(filePath, comment);
}
