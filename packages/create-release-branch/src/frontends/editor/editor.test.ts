import { describe, expect, it, vi } from 'vitest';

import * as envModule from '../../utils/env.js';
import * as miscUtils from '../../utils/misc-utils.js';
import { determineEditor, splitCommand } from './editor.js';

vi.mock('../../utils/env');
vi.mock('../../utils/misc-utils');

describe('editor', () => {
  describe('splitCommand', () => {
    it('splits the command into words at whitespace', () => {
      expect(splitCommand('  idea  --wait\t-n ')).toStrictEqual([
        'idea',
        '--wait',
        '-n',
      ]);
    });

    it('keeps whitespace inside double quotes', () => {
      expect(
        splitCommand('"/Applications/My Editor/bin/edit" --wait'),
      ).toStrictEqual(['/Applications/My Editor/bin/edit', '--wait']);
    });

    it('keeps whitespace inside single quotes', () => {
      expect(splitCommand("'my editor' -w")).toStrictEqual(['my editor', '-w']);
    });

    it('keeps a quote of the other kind inside quotes', () => {
      expect(splitCommand(`"it's" 'say "hi"'`)).toStrictEqual([
        "it's",
        'say "hi"',
      ]);
    });

    it('joins quoted and unquoted parts that touch', () => {
      expect(splitCommand('a"b c"d')).toStrictEqual(['ab cd']);
    });

    it('keeps empty quotes as an empty word', () => {
      expect(splitCommand('edit ""')).toStrictEqual(['edit', '']);
    });

    it('keeps backslashes as they are', () => {
      expect(splitCommand('C:\\Tools\\edit.exe')).toStrictEqual([
        'C:\\Tools\\edit.exe',
      ]);
    });

    it('returns no words for a command with only whitespace', () => {
      expect(splitCommand(' \t ')).toStrictEqual([]);
    });

    it('throws if a quote is not closed', () => {
      expect(() => splitCommand('"my editor --wait')).toThrow(
        'Unclosed quote in "my editor --wait',
      );
    });
  });

  describe('determineEditor', () => {
    it('passes the arguments in EDITOR to the editor', async () => {
      vi.spyOn(envModule, 'getEnvironmentVariables').mockReturnValue({
        EDITOR: 'idea --wait',
      });
      vi.when(vi.spyOn(miscUtils, 'resolveExecutable'))
        .calledWith('idea')
        .thenResolve('/path/to/idea');

      expect(await determineEditor()).toStrictEqual({
        path: '/path/to/idea',
        args: ['--wait'],
      });
    });

    it('resolves a quoted editor path that contains spaces', async () => {
      vi.spyOn(envModule, 'getEnvironmentVariables').mockReturnValue({
        EDITOR: '"/path/with spaces/editor" --wait',
      });
      vi.when(vi.spyOn(miscUtils, 'resolveExecutable'))
        .calledWith('/path/with spaces/editor')
        .thenResolve('/path/with spaces/editor');

      expect(await determineEditor()).toStrictEqual({
        path: '/path/with spaces/editor',
        args: ['--wait'],
      });
    });

    it.each(['', '  \t '])(
      'falls back to VSCode if EDITOR is %j',
      async (editor) => {
        vi.spyOn(envModule, 'getEnvironmentVariables').mockReturnValue({
          EDITOR: editor,
        });
        const resolveExecutableMock = vi.spyOn(miscUtils, 'resolveExecutable');
        vi.when(resolveExecutableMock)
          .calledWith('code')
          .thenResolve('/path/to/code');

        expect(await determineEditor()).toStrictEqual({
          path: '/path/to/code',
          args: ['--wait'],
        });
        expect(resolveExecutableMock).toHaveBeenCalledTimes(1);
      },
    );

    it('falls back to VSCode without the EDITOR arguments if the EDITOR executable does not resolve', async () => {
      vi.spyOn(envModule, 'getEnvironmentVariables').mockReturnValue({
        EDITOR: 'idea --wait --new-window',
      });
      const resolveExecutableMock = vi.spyOn(miscUtils, 'resolveExecutable');
      vi.when(resolveExecutableMock).calledWith('idea').thenResolve(null);
      vi.when(resolveExecutableMock)
        .calledWith('code')
        .thenResolve('/path/to/code');

      expect(await determineEditor()).toStrictEqual({
        path: '/path/to/code',
        args: ['--wait'],
      });
    });

    it('falls back to VSCode if EDITOR has a quote that is not closed', async () => {
      vi.spyOn(envModule, 'getEnvironmentVariables').mockReturnValue({
        EDITOR: '"my editor --wait',
      });
      const resolveExecutableMock = vi.spyOn(miscUtils, 'resolveExecutable');
      vi.when(resolveExecutableMock)
        .calledWith('code')
        .thenResolve('/path/to/code');

      expect(await determineEditor()).toStrictEqual({
        path: '/path/to/code',
        args: ['--wait'],
      });
      expect(resolveExecutableMock).toHaveBeenCalledTimes(1);
    });

    it('returns information about the editor from EDITOR if it resolves to an executable', async () => {
      vi.spyOn(envModule, 'getEnvironmentVariables').mockReturnValue({
        EDITOR: 'editor',
      });
      vi.when(vi.spyOn(miscUtils, 'resolveExecutable'))
        .calledWith('editor')
        .thenResolve('/path/to/resolved-editor');

      expect(await determineEditor()).toStrictEqual({
        path: '/path/to/resolved-editor',
        args: [],
      });
    });

    it('falls back to VSCode if it exists and if EDITOR does not point to an executable', async () => {
      vi.spyOn(envModule, 'getEnvironmentVariables').mockReturnValue({
        EDITOR: 'editor',
      });
      const resolveExecutableMock = vi.spyOn(miscUtils, 'resolveExecutable');
      vi.when(resolveExecutableMock).calledWith('editor').thenResolve(null);
      vi.when(resolveExecutableMock)
        .calledWith('code')
        .thenResolve('/path/to/code');

      expect(await determineEditor()).toStrictEqual({
        path: '/path/to/code',
        args: ['--wait'],
      });
    });

    it('returns null if resolving EDITOR returns null and resolving VSCode returns null', async () => {
      vi.spyOn(envModule, 'getEnvironmentVariables').mockReturnValue({
        EDITOR: 'editor',
      });
      const resolveExecutableMock = vi.spyOn(miscUtils, 'resolveExecutable');
      vi.when(resolveExecutableMock).calledWith('editor').thenResolve(null);
      vi.when(resolveExecutableMock).calledWith('code').thenResolve(null);

      expect(await determineEditor()).toBeNull();
    });

    it('returns null if resolving EDITOR returns null and resolving VSCode throws', async () => {
      vi.spyOn(envModule, 'getEnvironmentVariables').mockReturnValue({
        EDITOR: 'editor',
      });
      const resolveExecutableMock = vi.spyOn(miscUtils, 'resolveExecutable');
      vi.when(resolveExecutableMock).calledWith('editor').thenResolve(null);
      vi.when(resolveExecutableMock)
        .calledWith('code')
        .thenReject(new Error('some error'));

      expect(await determineEditor()).toBeNull();
    });

    it('returns null if resolving EDITOR throws and resolving VSCode returns null', async () => {
      vi.spyOn(envModule, 'getEnvironmentVariables').mockReturnValue({
        EDITOR: 'editor',
      });
      const resolveExecutableMock = vi.spyOn(miscUtils, 'resolveExecutable');
      vi.when(resolveExecutableMock)
        .calledWith('editor')
        .thenReject(new Error('some error'));
      vi.when(resolveExecutableMock).calledWith('code').thenResolve(null);

      expect(await determineEditor()).toBeNull();
    });

    it('returns null if resolving EDITOR throws and resolving VSCode throws', async () => {
      vi.spyOn(envModule, 'getEnvironmentVariables').mockReturnValue({
        EDITOR: 'editor',
      });
      const resolveExecutableMock = vi.spyOn(miscUtils, 'resolveExecutable');
      vi.when(resolveExecutableMock)
        .calledWith('editor')
        .thenReject(new Error('some error'));
      vi.when(resolveExecutableMock)
        .calledWith('code')
        .thenReject(new Error('some error'));

      expect(await determineEditor()).toBeNull();
    });

    it('returns null if EDITOR is unset and resolving VSCode returns null', async () => {
      vi.spyOn(envModule, 'getEnvironmentVariables').mockReturnValue({
        EDITOR: undefined,
      });
      vi.when(vi.spyOn(miscUtils, 'resolveExecutable'))
        .calledWith('code')
        .thenResolve(null);

      expect(await determineEditor()).toBeNull();
    });

    it('returns null if EDITOR is unset and resolving VSCode throws', async () => {
      vi.spyOn(envModule, 'getEnvironmentVariables').mockReturnValue({
        EDITOR: undefined,
      });
      vi.when(vi.spyOn(miscUtils, 'resolveExecutable'))
        .calledWith('code')
        .thenReject(new Error('some error'));

      expect(await determineEditor()).toBeNull();
    });
  });
});
