import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomBytes } from 'node:crypto';

const execFileAsync = promisify(execFile);
const XATTR_TAGS = 'com.apple.metadata:_kMDItemUserTags';
const XATTR_COMMENT = 'com.apple.metadata:kMDItemFinderComment';

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function writeBinaryPlistXattr(
  filePath: string,
  attr: string,
  plistXml: string,
): Promise<void> {
  const tmp = path.join(os.tmpdir(), `sortai-${randomBytes(6).toString('hex')}.plist`);
  await fs.writeFile(tmp, plistXml, 'utf8');
  try {
    await execFileAsync('plutil', ['-convert', 'binary1', tmp], { timeout: 5_000 });
    const hex = (await fs.readFile(tmp)).toString('hex');
    await execFileAsync('xattr', ['-wx', attr, hex, filePath], { timeout: 5_000 });
  } finally {
    await fs.unlink(tmp).catch(() => {});
  }
}

export async function clearMacosMetadata(filePath: string): Promise<void> {
  await execFileAsync('xattr', ['-d', XATTR_TAGS, filePath], { timeout: 5_000 }).catch(() => {});
  await execFileAsync('xattr', ['-d', XATTR_COMMENT, filePath], { timeout: 5_000 }).catch(() => {});
}

export async function setMacosTags(filePath: string, tags: string[]): Promise<void> {
  if (tags.length === 0) return;
  const items = tags.map(t => `  <string>${escapeXml(t)}\n0</string>`).join('\n');
  const plistXml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n` +
    `<plist version="1.0">\n<array>\n${items}\n</array>\n</plist>\n`;
  await writeBinaryPlistXattr(path.resolve(filePath), XATTR_TAGS, plistXml);
}

export async function setFinderComment(filePath: string, comment: string): Promise<void> {
  const trimmed = comment.slice(0, 500).trim();
  if (!trimmed) return;
  const plistXml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n` +
    `<plist version="1.0">\n<string>${escapeXml(trimmed)}</string>\n</plist>\n`;
  await writeBinaryPlistXattr(path.resolve(filePath), XATTR_COMMENT, plistXml);
}

export async function writeFileMetadata(
  filePath: string,
  tags: string[],
  comment: string,
): Promise<void> {
  await clearMacosMetadata(filePath);
  await setMacosTags(filePath, tags);
  await setFinderComment(filePath, comment);
  execFile('mdimport', [filePath], { timeout: 5_000 }, () => {});
}
