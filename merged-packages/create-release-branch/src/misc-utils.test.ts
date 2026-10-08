import * as execaModule from 'execa';
import type { ExecaReturnValue } from 'execa';
import { describe, expect, it, vi } from 'vitest';
import * as whichModule from 'which';

import {
  isErrorWithCode,
  isErrorWithMessage,
  isErrorWithStack,
  wrapError,
  resolveExecutable,
  runCommand,
  getStdoutFromCommand,
  getLinesFromCommand,
  convertToHttpsGitHubRepositoryUrl,
} from './misc-utils.js';

vi.mock('which');
vi.mock('execa', async () => ({
  ...(await vi.importActual('execa')),
  execa: vi.fn(),
}));

/**
 * Builds a complete `execa` result for use in tests, since only `stdout`
 * matters to the functions under test here.
 *
 * @param stdout - The standard output that the command produced.
 * @returns The mock `execa` result.
 */
function buildExecaReturnValue(stdout: string): ExecaReturnValue<string> {
  return {
    command: 'some command',
    escapedCommand: 'some command',
    exitCode: 0,
    stdout,
    stderr: '',
    failed: false,
    timedOut: false,
    killed: false,
    cwd: process.cwd(),
    isCanceled: false,
  };
}

describe('misc-utils', () => {
  describe('isErrorWithCode', () => {
    it('returns true if given an object with a "code" property', () => {
      expect(isErrorWithCode({ code: 'some code' })).toBe(true);
    });

    it('returns false if given null', () => {
      expect(isErrorWithCode(null)).toBe(false);
    });

    it('returns false if given undefined', () => {
      expect(isErrorWithCode(undefined)).toBe(false);
    });

    it('returns false if given something that is not typeof object', () => {
      expect(isErrorWithCode(12345)).toBe(false);
    });

    it('returns false if given an object that does not have a "code" property', () => {
      expect(isErrorWithCode({})).toBe(false);
    });
  });

  describe('isErrorWithMessage', () => {
    it('returns true if given an object with a "message" property', () => {
      expect(isErrorWithMessage({ message: 'some message' })).toBe(true);
    });

    it('returns false if given null', () => {
      expect(isErrorWithMessage(null)).toBe(false);
    });

    it('returns false if given undefined', () => {
      expect(isErrorWithMessage(undefined)).toBe(false);
    });

    it('returns false if given something that is not typeof object', () => {
      expect(isErrorWithMessage(12345)).toBe(false);
    });

    it('returns false if given an object that does not have a "message" property', () => {
      expect(isErrorWithMessage({})).toBe(false);
    });
  });

  describe('isErrorWithStack', () => {
    it('returns true if given an object with a "stack" property', () => {
      expect(isErrorWithStack({ stack: 'some stack' })).toBe(true);
    });

    it('returns false if given null', () => {
      expect(isErrorWithStack(null)).toBe(false);
    });

    it('returns false if given undefined', () => {
      expect(isErrorWithStack(undefined)).toBe(false);
    });

    it('returns false if given something that is not typeof object', () => {
      expect(isErrorWithStack(12345)).toBe(false);
    });

    it('returns false if given an object that does not have a "stack" property', () => {
      expect(isErrorWithStack({})).toBe(false);
    });
  });

  describe('wrapError', () => {
    it('returns a new Error that links to the given Error', () => {
      const originalError = new Error('oops');
      const newError = wrapError('Some message', originalError);

      expect(newError.message).toBe('Some message');
      expect(newError.cause).toBe(originalError);
    });

    it('copies over any "code" property that exists on the given Error', () => {
      const originalError: Error & { code?: string } = new Error('oops');
      originalError.code = 'CODE';
      const newError: Error & { code?: string } = wrapError(
        'Some message',
        originalError,
      );

      expect(newError.code).toBe('CODE');
    });

    it('returns a new Error which prefixes the given message', () => {
      const newError = wrapError('Some message', 'Some original message');

      expect(newError.message).toBe('Some message: Some original message');
      expect(newError.cause).toBeUndefined();
    });
  });

  describe('resolveExecutable', () => {
    it('returns the fullpath of the given executable as returned by "which"', async () => {
      vi.spyOn(whichModule, 'default').mockResolvedValue('/path/to/executable');

      expect(await resolveExecutable('executable')).toBe('/path/to/executable');
    });

    it('returns null if the given executable cannot be found', async () => {
      vi.spyOn(whichModule, 'default').mockRejectedValue(
        new Error('not found: executable'),
      );

      expect(await resolveExecutable('executable')).toBeNull();
    });

    it('throws the error that "which" throws if it is not a "not found" error', async () => {
      vi.spyOn(whichModule, 'default').mockRejectedValue(
        new Error('something else'),
      );

      await expect(resolveExecutable('executable')).rejects.toThrow(
        'something else',
      );
    });
  });

  describe('runCommand', () => {
    it('runs the command, discarding its output', async () => {
      const execaSpy = vi
        .spyOn(execaModule, 'execa')
        .mockResolvedValue(buildExecaReturnValue('   some output  '));

      const result = await runCommand('some command', ['arg1', 'arg2'], {
        all: true,
      });

      expect(execaSpy).toHaveBeenCalledWith('some command', ['arg1', 'arg2'], {
        all: true,
      });
      expect(result).toBeUndefined();
    });
  });

  describe('getStdoutFromCommand', () => {
    it('executes the given command and returns a version of the standard out from the command with whitespace trimmed', async () => {
      const execaSpy = vi
        .spyOn(execaModule, 'execa')
        .mockResolvedValue(buildExecaReturnValue('   some output  '));

      const output = await getStdoutFromCommand(
        'some command',
        ['arg1', 'arg2'],
        { all: true },
      );

      expect(execaSpy).toHaveBeenCalledWith('some command', ['arg1', 'arg2'], {
        all: true,
      });
      expect(output).toBe('some output');
    });
  });

  describe('getLinesFromCommand', () => {
    it('executes the given command and returns the standard out from the command split into lines', async () => {
      const execaSpy = vi
        .spyOn(execaModule, 'execa')
        .mockResolvedValue(buildExecaReturnValue('line 1\nline 2\nline 3'));

      const lines = await getLinesFromCommand(
        'some command',
        ['arg1', 'arg2'],
        { all: true },
      );

      expect(execaSpy).toHaveBeenCalledWith('some command', ['arg1', 'arg2'], {
        all: true,
      });
      expect(lines).toStrictEqual(['line 1', 'line 2', 'line 3']);
    });

    it('does not strip leading and trailing whitespace from the output, but does remove empty lines', async () => {
      const execaSpy = vi
        .spyOn(execaModule, 'execa')
        .mockResolvedValue(
          buildExecaReturnValue('  line 1\nline 2\n\n   line 3   \n'),
        );

      const lines = await getLinesFromCommand(
        'some command',
        ['arg1', 'arg2'],
        { all: true },
      );

      expect(execaSpy).toHaveBeenCalledWith('some command', ['arg1', 'arg2'], {
        all: true,
      });
      expect(lines).toStrictEqual(['  line 1', 'line 2', '   line 3   ']);
    });
  });

  describe('convertToHttpsRepositoryUrl', () => {
    it('returns the URL of the "origin" remote of the given repo if it looks like a HTTPS public GitHub repo URL', () => {
      expect(
        convertToHttpsGitHubRepositoryUrl(
          'https://github.com/example-org/example-repo',
        ),
      ).toBe('https://github.com/example-org/example-repo');
    });

    it('lops ".git" off from the HTTPS public GitHub repo URL', () => {
      expect(
        convertToHttpsGitHubRepositoryUrl(
          'https://github.com/example-org/example-repo.git',
        ),
      ).toBe('https://github.com/example-org/example-repo');
    });

    it('converts an SSH GitHub repo URL into an HTTPS URL (without the trailing ".git")', () => {
      expect(
        convertToHttpsGitHubRepositoryUrl(
          'git@github.com:example-org/example-repo.git',
        ),
      ).toBe('https://github.com/example-org/example-repo');
    });

    it.each([
      'foo',
      'http://github.com/example-org',
      'https://github.com/example-org',
      'http://github.com/example-org/example-repo',
      'https://github.comzzzz/example-org/example-repo',
      'https://gitbar.foo/example-org/example-repo',
      'git@github.com:example-org',
      'git@gitbar.foo:example-org/example-repo.git',
      'git@github.com:example-org/example-repo.foo',
    ])(
      'throws if the URL is in an invalid format such as "%s"',
      (repositoryUrl) => {
        expect(() => convertToHttpsGitHubRepositoryUrl(repositoryUrl)).toThrow(
          `Unrecognized repository URL: ${repositoryUrl}`,
        );
      },
    );
  });
});
