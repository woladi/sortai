import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// W ESM musimy sami zdefiniować __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function getOcrText(filePath: string): string {
    // Ścieżka do binarki (wychodzimy z src do głównego i do bin)
    const binPath = path.resolve(__dirname, '../bin/vision-helper');
    const absolutePath = path.resolve(filePath);
    
    try {
        const stdout = execSync(`"${binPath}" "${absolutePath}"`, { encoding: 'utf8' });
        return stdout.trim();
    } catch (err) {
        console.error(`❌ Błąd OCR dla pliku: ${filePath}`);
        return "";
    }
}