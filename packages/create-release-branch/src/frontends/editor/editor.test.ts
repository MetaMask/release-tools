import { describe, expect, it, vi } from 'vitest';

import * as envModule from '../../utils/env.js';
import * as miscUtils from '../../utils/misc-utils.js';
import { determineEditor } from './editor.js';

vi.mock('../../utils/env');
vi.mock('../../utils/misc-utils');

describe('editor', () => {
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
        .calledWith('idea --wait --new-window')
        .thenResolve(null);
      vi.when(resolveExecutableMock)
        .calledWith('code')
        .thenResolve('/path/to/code');

      expect(await determineEditor()).toStrictEqual({
        path: '/path/to/code',
        args: ['--wait'],
      });
    });

    it('expands variables in EDITOR', async () => {
      vi.stubEnv('EDITOR_CONFIG_DIRECTORY', '/path/to/config');
      vi.spyOn(envModule, 'getEnvironmentVariables').mockReturnValue({
        EDITOR: 'edit --config $EDITOR_CONFIG_DIRECTORY/edit.json',
      });
      vi.when(vi.spyOn(miscUtils, 'resolveExecutable'))
        .calledWith('edit')
        .thenResolve('/path/to/edit');

      expect(await determineEditor()).toStrictEqual({
        path: '/path/to/edit',
        args: ['--config', '/path/to/config/edit.json'],
      });
    });

    it('resolves an unquoted editor path that contains spaces as a whole', async () => {
      vi.spyOn(envModule, 'getEnvironmentVariables').mockReturnValue({
        EDITOR: '/Applications/My Editor/bin/edit',
      });
      const resolveExecutableMock = vi.spyOn(miscUtils, 'resolveExecutable');
      vi.when(resolveExecutableMock)
        .calledWith('/Applications/My')
        .thenResolve(null);
      vi.when(resolveExecutableMock)
        .calledWith('/Applications/My Editor/bin/edit')
        .thenResolve('/Applications/My Editor/bin/edit');

      expect(await determineEditor()).toStrictEqual({
        path: '/Applications/My Editor/bin/edit',
        args: [],
      });
    });

    it('falls back to VSCode if EDITOR contains shell operators', async () => {
      vi.spyOn(envModule, 'getEnvironmentVariables').mockReturnValue({
        EDITOR: 'vim | cat',
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
