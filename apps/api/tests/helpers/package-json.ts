import { readFileSync } from 'fs';
import path from 'path';

/** The fields of a package.json (or tsconfig.json) that the guard tests read. */
export interface PackageJson {
  name?: string;
  extends?: string;
  workspaces?: string[];
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  overrides?: Record<string, string>;
}

export function readPackageJson(root: string, file: string): PackageJson {
  return JSON.parse(readFileSync(path.join(root, file), 'utf-8')) as PackageJson;
}
