import { getOcrText } from './ocr.js';

const testFile = process.argv[2]; // Ścieżka do obrazka jako argument

if (!testFile) {
    console.log("Użycie: npm run test-ocr -- ścieżka/do/obrazka.png");
} else {
    console.log(`🔍 Testuję OCR dla: ${testFile}...`);
    const result = getOcrText(testFile);
    console.log("--- WYNIK ---");
    console.log(result || "(Brak tekstu lub błąd)");
    console.log("-------------");
}