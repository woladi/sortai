import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const binDir = path.resolve(__dirname, '../bin');
const sourceFile = path.resolve(__dirname, '../src/native/vision-helper.swift');
const outputFile = path.resolve(binDir, 'vision-helper');

console.log('🛠️  URUCHAMIAM SETUP NATIVE...');

try {
    // 1. Sprawdź czy plik źródłowy istnieje
    if (!fs.existsSync(sourceFile)) {
        throw new Error(`Nie znaleziono pliku źródłowego: ${sourceFile}`);
    }

    // 2. Stwórz folder bin
    if (!fs.existsSync(binDir)) {
        console.log('📁 Tworzę folder /bin...');
        fs.mkdirSync(binDir, { recursive: true });
    }

    // 3. Kompilacja z WYMUSZONYM wyjściem do konsoli
    console.log('🔨 Kompilacja Swift...');
    
    // Kluczowa zmiana: stdio: 'inherit' sprawi, że błędy swiftc zobaczysz od razu
    execSync(`swiftc -O "${sourceFile}" -o "${outputFile}"`, { stdio: 'inherit' });

    if (fs.existsSync(outputFile)) {
        console.log('✅ SUKCES: Binarka utworzona pomyślnie.');
    } else {
        throw new Error('Kompilator zakończył pracę, ale plik binarny nie powstał.');
    }

} catch (error) {
    console.error('\n❌ KRYTYCZNY BŁĄD SETUPU:');
    console.error(error.message);
    process.exit(1); // To zatrzyma 'npm run build', jeśli setup zawiedzie
}