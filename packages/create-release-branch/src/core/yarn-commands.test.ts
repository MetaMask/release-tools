import { describe, expect, it, vi } from 'vitest';

import * as miscUtils from '../utils/misc-utils.js';
import {
  deduplicateDependencies,
  fixConstraints,
  updateYarnLockfile,
} from './yarn-commands.js';

vi.mock('../utils/misc-utils');

describe('yarn-commands', () => {
  describe('fixConstraints', () => {
    it('runs "yarn constraints --fix" with the correct parameters', async () => {
      const repositoryDirectoryPath = '/path/to/repo';
      const onLine = vi.fn();

      await fixConstraints(repositoryDirectoryPath, onLine);

      expect(miscUtils.runCommandWithOutput).toHaveBeenCalledWith(
        'yarn',
        ['constraints', '--fix'],
        {
          cwd: repositoryDirectoryPath,
        },
        onLine,
      );
    });
  });

  describe('updateYarnLockfile', () => {
    it('runs "yarn install --no--immutable" with the correct parameters', async () => {
      const repositoryDirectoryPath = '/path/to/repo';
      const onLine = vi.fn();

      await updateYarnLockfile('/path/to/repo', onLine);

      expect(miscUtils.runCommandWithOutput).toHaveBeenCalledWith(
        'yarn',
        ['install', '--no-immutable'],
        {
          cwd: repositoryDirectoryPath,
        },
        onLine,
      );
    });
  });

  describe('deduplicateDependencies', () => {
    it('runs "yarn dedupe" with the correct parameters', async () => {
      const repositoryDirectoryPath = '/path/to/repo';
      const onLine = vi.fn();

      await deduplicateDependencies('/path/to/repo', onLine);

      expect(miscUtils.runCommandWithOutput).toHaveBeenCalledWith(
        'yarn',
        ['dedupe'],
        {
          cwd: repositoryDirectoryPath,
        },
        onLine,
      );
    });
  });
});
