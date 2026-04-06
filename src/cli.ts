import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url'; // Dodaj to
import { DocumentAnalyzer } from './ai.js';

// Tych dwóch linii brakuje:
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
    const args = process.argv.slice(2);
    const isJsonMode = args.includes('--json');
    const filePath = args.find(arg => !arg.startsWith('--'));

    if (!filePath) {
        console.error("Użycie: npm start <sciezka_do_obrazu> [--json]");
        process.exit(1);
    }

    const fullPath = path.resolve(filePath);
    if (!fs.existsSync(fullPath)) {
        console.error(`BŁĄD: Plik nie istnieje: ${fullPath}`);
        process.exit(1);
    }

    try {
        // 1. Uruchomienie binarnego OCR ze Swifta
        console.log("👁️  Uruchamiam Apple Vision OCR...");
        const binPath = path.join(__dirname, '../bin/vision-helper');
        
        // Zawsze pobieramy JSON z binarnego helpera, żeby mieć współrzędne dla AI
        const ocrOutput = execSync(`${binPath} --json "${fullPath}"`).toString();
        const ocrData = JSON.parse(ocrOutput);

        // Jeśli użytkownik chciał tylko surowy JSON, kończymy tutaj
        if (isJsonMode) {
            console.log(JSON.stringify(ocrData, null, 2));
            return;
        }

        // 2. Inteligenta analiza hybrydowa (LLaVA + Mistral)
        console.log("🧠 Rozpoczynam inteligentną analizę dokumentu...");
        const analyzer = new DocumentAnalyzer();
        
        const finalReport = await analyzer.analyze(fullPath, ocrData);

        console.log("\n--- FINALNY RAPORT AI ---");
        console.log(finalReport);
        console.log("--------------------------");
        const reportPath = fullPath.replace(path.extname(fullPath), '.md');
        fs.writeFileSync(reportPath, finalReport);
        console.log(`✅ Raport zapisany w: ${reportPath}`);

    } catch (error: any) {
        console.error("❌ Wystąpił błąd podczas procesowania:");
        console.error(error.message);
    }
}

main();