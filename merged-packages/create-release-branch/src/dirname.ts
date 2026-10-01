import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Get the current directory path.
 *
 * @returns The current directory path.
 */
export function getCurrentDirectoryPath() {
  return __dirname;
}
