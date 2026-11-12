import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

import { withSandbox } from '../../tests/helpers.js';
import { readReleaseConfig, ReleaseConfigModeError } from './release-config.js';

describe('release-config', () => {
  describe('readReleaseConfig', () => {
    it('uses the legacy mode when the project has no config file', async () => {
      await withSandbox(async ({ directoryPath }) => {
        expect(await readReleaseConfig(directoryPath)).toStrictEqual({
          mode: 'legacy',
        });
      });
    });

    it('uses the legacy mode when the config file has no mode', async () => {
      await withSandbox(async ({ directoryPath }) => {
        await fs.promises.writeFile(
          path.join(directoryPath, 'release.config.json'),
          JSON.stringify({ versioningStrategy: 'independent' }),
        );

        expect(await readReleaseConfig(directoryPath)).toStrictEqual({
          mode: 'legacy',
        });
      });
    });

    it('reads the mode from the config file', async () => {
      await withSandbox(async ({ directoryPath }) => {
        await fs.promises.writeFile(
          path.join(directoryPath, 'release.config.json'),
          JSON.stringify({ mode: 'legacy' }),
        );

        expect(await readReleaseConfig(directoryPath)).toStrictEqual({
          mode: 'legacy',
        });
      });
    });

    it.each(['unknown', 1, null])('rejects the mode %j', async (mode) => {
      await withSandbox(async ({ directoryPath }) => {
        const configPath = path.join(directoryPath, 'release.config.json');
        await fs.promises.writeFile(configPath, JSON.stringify({ mode }));

        await expect(readReleaseConfig(directoryPath)).rejects.toThrow(
          new ReleaseConfigModeError({ mode, configPath }),
        );
      });
    });

    it('describes an invalid mode with the valid modes and the path', () => {
      const error = new ReleaseConfigModeError({
        mode: 'unknown',
        configPath: '/path/to/release.config.json',
      });

      expect(
        error.describe({
          name: (text) => `<${text}>`,
          dim: (text) => `(${text})`,
        }),
      ).toStrictEqual({
        title: 'The "mode" in <release.config.json> is not valid: "unknown"',
        lines: ['Use one of: "legacy".', '(/path/to/release.config.json)'],
      });
      expect(error.message).toBe(
        [
          'The "mode" in release.config.json is not valid: "unknown"',
          'Use one of: "legacy".',
          '/path/to/release.config.json',
        ].join('\n'),
      );
    });

    it('rejects a config file that is not valid JSON', async () => {
      await withSandbox(async ({ directoryPath }) => {
        const configPath = path.join(directoryPath, 'release.config.json');
        await fs.promises.writeFile(configPath, '{');

        await expect(readReleaseConfig(directoryPath)).rejects.toThrow(
          `Could not read JSON file '${configPath}'`,
        );
      });
    });
  });
});
