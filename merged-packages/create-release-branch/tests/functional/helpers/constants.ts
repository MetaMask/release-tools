import path from 'path';

const ROOT_DIR = path.resolve(__dirname, '../../..');
const REPOSITORY_ROOT = path.resolve(ROOT_DIR, '../..');
export const TOOL_EXECUTABLE_PATH = path.join(ROOT_DIR, 'src', 'cli.ts');

export const TSX_PATH = path.join(
  REPOSITORY_ROOT,
  'node_modules',
  '.bin',
  'tsx',
);
