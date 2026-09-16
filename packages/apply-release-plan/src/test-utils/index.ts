// Vendored (trimmed) from the changesets repository's private
// `@changesets/test-utils` workspace package, at the
// `@changesets/apply-release-plan@8.1.1` tag (scripts/test-utils/src/index.ts).
// Only the helpers used by this package's tests are kept.
import { createFixture } from 'fs-fixture';
import type { FileTree } from 'fs-fixture';
import type fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { onTestFinished, vi } from 'vitest';

type LogSilencer = {
  setup(): () => void;
};

const createLogSilencer = (): LogSilencer => {
  const originalConsoleError = console.error;
  const originalConsoleInfo = console.info;
  const originalConsoleLog = console.log;
  const originalConsoleWarn = console.warn;

  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);

  return {
    setup() {
      console.error = vi.fn();
      console.info = vi.fn();
      console.log = vi.fn();
      console.warn = vi.fn();

      process.stdout.write = vi.fn();
      process.stderr.write = vi.fn();

      return () => {
        console.error = originalConsoleError;
        console.info = originalConsoleInfo;
        console.log = originalConsoleLog;
        console.warn = originalConsoleWarn;

        process.stdout.write = originalStdoutWrite;
        process.stderr.write = originalStderrWrite;
      };
    },
  };
};

export const temporarilySilenceLogs =
  (testFn: () => Promise<void> | void) => async (): Promise<void> => {
    const silencer = createLogSilencer();
    const dispose = silencer.setup();
    try {
      await testFn();
    } finally {
      dispose();
    }
  };

export type Fixture = FileTree;

export async function testdir(dir?: Fixture): Promise<string> {
  const fixture = await createFixture(dir, {
    fs: {
      ...fsp,
      rm: async (rmPath, options) => {
        return fsp.rm(rmPath, {
          // make it more forgiving to fs contention
          // especially on Windows, given CI flakes we experienced caused by "EBUSY: resource busy or locked"
          maxRetries: 3,
          retryDelay: 100,
          ...options,
        });
      },
    },
  });
  onTestFinished(async () => fixture.rm());
  return fixture.path;
}

export async function outputFile(
  filePath: string,
  content: string,
  encoding = 'utf8' as fs.ObjectEncodingOptions,
): Promise<void> {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, content, encoding);
}
