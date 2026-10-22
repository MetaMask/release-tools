import path from 'path';

const ROOT_DIR = path.resolve(__dirname, '../../..');
const REPOSITORY_ROOT = path.resolve(ROOT_DIR, '../..');
export const TOOL_EXECUTABLE_PATH = path.join(ROOT_DIR, 'src', 'cli.ts');

// The tool runs from a temporary repository, so `tsx` would not find the
// package's `tsconfig.json` on its own. Its `paths` resolve sibling workspace
// packages to their source, so the tool runs without building them first.
export const TSCONFIG_PATH = path.join(ROOT_DIR, 'tsconfig.json');

export const TSX_PATH = path.join(
  REPOSITORY_ROOT,
  'node_modules',
  '.bin',
  'tsx',
);
