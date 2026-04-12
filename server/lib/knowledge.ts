import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Reads a knowledge file and returns its content as a string.
 * @param filePath - Path relative to the project root (as stored in the DB).
 */
export function loadKnowledgeFile(filePath: string): string {
  const absolutePath = join(process.cwd(), filePath);

  if (!existsSync(absolutePath)) {
    throw new Error(
      `Knowledge file not found: "${absolutePath}" (resolved from filePath="${filePath}")`
    );
  }

  return readFileSync(absolutePath, 'utf-8');
}
