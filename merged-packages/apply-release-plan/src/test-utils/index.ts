// Vendored (trimmed) from the changesets repository's private
// `@changesets/test-utils` workspace package (scripts/test-utils/src/index.ts).
// Only the helpers used by this package's tests are kept.
import type fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { createFixture, type FileTree } from "fs-fixture";
import { onTestFinished, vi } from "vitest";

const createLogSilencer = () => {
  const originalConsoleError = console.error;
  const originalConsoleInfo = console.info;
  const originalConsoleLog = console.log;
  const originalConsoleWarn = console.warn;

  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;

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
  (testFn: () => Promise<void> | void) => async () => {
    const silencer = createLogSilencer();
    const dispose = silencer.setup();
    try {
      await testFn();
    } finally {
      dispose();
    }
  };

export type Fixture = FileTree;

export async function testdir(dir?: Fixture) {
  const fixture = await createFixture(dir, {
    fs: {
      ...fsp,
      rm: (path, options) => {
        return fsp.rm(path, {
          // make it more forgiving to fs contention
          // especially on Windows, given CI flakes we experienced caused by "EBUSY: resource busy or locked"
          maxRetries: 3,
          retryDelay: 100,
          ...options,
        });
      },
    },
  });
  onTestFinished(() => fixture.rm());
  return fixture.path;
}

export async function outputFile(
  filePath: string,
  content: string,
  encoding = "utf8" as fs.ObjectEncodingOptions,
) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, content, encoding);
}
