import { readdirSync, statSync } from 'fs';
import path from 'path';

/** Every `.ts` file under `dir`, recursively. The static guards scan source with it. */
export function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? sourceFiles(full) : full.endsWith('.ts') ? [full] : [];
  });
}
