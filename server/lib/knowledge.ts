import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';

/**
 * Reads all .txt files in a topic's folder and returns the combined content.
 * filePath is the path to the primary file (as stored in the DB); the folder
 * is derived from it so any extra .txt files a person drops in are included.
 */
export function loadKnowledgeFile(filePath: string): string {
  const absoluteFilePath = join(process.cwd(), filePath);
  const folderPath = dirname(absoluteFilePath);

  if (!existsSync(folderPath)) {
    throw new Error(
      `Knowledge folder not found: "${folderPath}" (resolved from filePath="${filePath}")`
    );
  }

  const txtFiles = readdirSync(folderPath)
    .filter(f => f.endsWith('.txt'))
    .sort();

  if (txtFiles.length === 0) {
    throw new Error(`No .txt files found in knowledge folder: "${folderPath}"`);
  }

  return txtFiles
    .map(f => readFileSync(join(folderPath, f), 'utf-8'))
    .join('\n\n---\n\n');
}
