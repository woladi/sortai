import axios from 'axios';
import * as fs from 'fs';
import path from 'path';

interface OCRBlock {
  x: number;
  y: number;
  w: number;
  h: number;
  t: string;
  style?: {
    color: string;
    weight: string;
    role: string;
  };
}

const OLLAMA_API = "http://localhost:11434/api/generate";

export class DocumentAnalyzer {
  private modelVision = "llava";
  private modelText = "mistral-nemo";

  /**
   * Główna metoda wywoływana z cli.ts
   */
  public async analyze(imagePath: string, ocrData: OCRBlock[]): Promise<string> {
    console.log(`[1/3] Rozpoczynam wzbogacanie wizualne (${ocrData.length} bloków)...`);
    const enrichedData = await this.enrichInChunks(imagePath, ocrData, 5);

    console.log("[2/3] Przesyłam wzbogacony JSON do analizy strukturalnej...");
    const markdown = await this.generateMarkdown(enrichedData);

    return markdown;
  }

  /**
   * Dzieli dane na mniejsze paczki dla LLaVA
   */
private async enrichInChunks(imagePath: string, data: OCRBlock[], chunkSize: number): Promise<OCRBlock[]> {
    const enriched: OCRBlock[] = [];
    
    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.slice(i, i + chunkSize);
      console.log(` -> Przetwarzam paczkę ${Math.floor(i / chunkSize) + 1}...`);
      
      const response = await this.queryLlava(imagePath, chunk);
      
      try {
        // Wyciągamy JSON z tekstu (na wypadek gdyby model dopisał coś od siebie)
        const jsonMatch = response.match(/\[[\s\S]*\]/);
        const jsonString = jsonMatch ? jsonMatch[0] : response;

        const parsedChunk = JSON.parse(jsonString);
        const finalChunk = Array.isArray(parsedChunk) ? parsedChunk : [];
        
        if (finalChunk.length === 0) {
           console.warn("⚠️ Paczka pusta lub błędna, zachowuję oryginał.");
           enriched.push(...chunk);
        } else {
           // Mapujemy wyniki, aby upewnić się, że mamy tekst i styl
           const mapped = chunk.map((original, idx) => ({
             ...original,
             style: finalChunk[idx]?.style || { color: "unknown", weight: "normal", role: "text" }
           }));
           enriched.push(...mapped);
        }
      } catch (e) {
        console.error("⚠️ Błąd parsowania - model zwrócił niepoprawny format. Pomijam wzbogacanie tej paczki.");
        enriched.push(...chunk);
      }
    }
    return enriched;
  }

  private async queryLlava(imagePath: string, chunk: OCRBlock[]): Promise<string> {
    const prompt = `Task: Visual Analysis.
    I provide a list of text found on an image. For each item, identify its visual style.
    Return ONLY a JSON array of objects with "t" and "style" (color, weight, role).
    
    Data to process:
    ${JSON.stringify(chunk.map(c => ({ t: c.t, x: c.x, y: c.y })))}
    
    Example output format:
    [{"t": "text", "style": {"color": "blue", "weight": "bold", "role": "link"}}]`;
    
    const imageBase64 = fs.readFileSync(imagePath, { encoding: 'base64' });

    try {
      const res = await axios.post(OLLAMA_API, {
        model: this.modelVision,
        prompt: prompt,
        images: [imageBase64],
        stream: false,
        options: {
          temperature: 0.0, // Maksymalna precyzja
          num_predict: 1000
        }
      });

      return res.data.response;
    } catch (err) {
      return "[]";
    }
  }

  private async generateMarkdown(data: OCRBlock[]): Promise<string> {
    const prompt = `
  Task: Reconstruct a web interface from JSON OCR data into a precise Markdown document.
  
  STRICT RULES FOR STRUCTURE:
  1. AD CLUSTERING: Each advertisement or logical block MUST be treated as a separate entity. A new block usually starts when you see a domain name (e.g., ends in .pl, .com, .online) or a large blue title.
  2. VERTICAL SPATIAL INTEGRITY: Use the 'y' coordinates as your primary guide. Do not jump between distant 'y' values. If two text blocks have a 'y' difference greater than 0.08, they MUST belong to different sections.
  3. FRAGMENT GROUPING: Only merge text fragments into a single paragraph if their 'y' coordinates are very close (difference < 0.03).
  4. HIERARCHY:
     - Use '##' for the main advertisement titles or domain names.
     - Use '###' for sub-links or bullet points within that specific ad (e.g., "Pytania o upadłość").
     - Use '**text**' for any item where 'weight' is 'bold'.
  5. LINKS: Format blue items or URLs as [Text](URL). If the URL is in a separate nearby block, combine them into one link.
  6. NO HALLUCINATIONS: Use ONLY the text provided in the 't' field. Do not move descriptions from one '##' section to another.
  
  Data to process:
  ${JSON.stringify(data)}
`;

    const res = await axios.post(OLLAMA_API, {
      model: this.modelText,
      prompt: prompt,
      stream: false
    });

    return res.data.response;
  }
}