import { promises as fs } from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import type { MoveOp } from './plan.js';

export async function executeMove(op: MoveOp): Promise<void> {
  await fs.mkdir(path.dirname(op.to), { recursive: true });
  try {
    await fs.rename(op.from, op.to);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EXDEV') {
      await fs.copyFile(op.from, op.to);
      await fs.unlink(op.from);
    } else {
      throw err;
    }
  }
  execFile('mdimport', [op.to], { timeout: 5_000 }, () => {});
}
