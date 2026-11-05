import { describe, expect, it, vi } from 'vitest';

import { buildMockProject } from '../../tests/unit/helpers.js';
import type { FrontEnd } from '../core/front-end.js';
import type { Mode } from '../core/mode.js';
import * as editorFrontEndModule from '../frontends/editor/editor-front-end.js';
import * as uiFrontEndModule from '../frontends/ui/server.js';
import * as legacyModeModule from '../modes/legacy/legacy-mode.js';
import { selectFrontEnd, selectMode } from './select.js';

vi.mock('../frontends/editor/editor-front-end');
vi.mock('../frontends/ui/server');
vi.mock('../modes/legacy/legacy-mode');

describe('select', () => {
  describe('selectMode', () => {
    it('selectMode returns the legacy mode', () => {
      const project = buildMockProject();
      const legacyMode = { name: 'legacy' } as Mode<never>;
      const createLegacyModeSpy = vi
        .spyOn(legacyModeModule, 'createLegacyMode')
        .mockReturnValue(legacyMode);

      const mode = selectMode('legacy', {
        project,
        defaultBranch: 'main',
        formatter: 'prettier',
      });

      expect(createLegacyModeSpy).toHaveBeenCalledWith({
        project,
        defaultBranch: 'main',
        formatter: 'prettier',
      });
      expect(mode).toBe(legacyMode);
    });
  });

  describe('selectFrontEnd', () => {
    it('selectFrontEnd returns the editor front end', () => {
      const editorFrontEnd: FrontEnd = { run: vi.fn() };
      const createEditorFrontEndSpy = vi
        .spyOn(editorFrontEndModule, 'createEditorFrontEnd')
        .mockReturnValue(editorFrontEnd);

      const frontEnd = selectFrontEnd('editor', {
        tempDirectoryPath: '/path/to/temp/directory',
        reset: true,
        port: 3000,
      });

      expect(createEditorFrontEndSpy).toHaveBeenCalledWith({
        tempDirectoryPath: '/path/to/temp/directory',
        reset: true,
      });
      expect(frontEnd).toBe(editorFrontEnd);
    });

    it('selectFrontEnd returns the UI front end', () => {
      const uiFrontEnd: FrontEnd = { run: vi.fn() };
      const createUIFrontEndSpy = vi
        .spyOn(uiFrontEndModule, 'createUIFrontEnd')
        .mockReturnValue(uiFrontEnd);

      const frontEnd = selectFrontEnd('ui', {
        tempDirectoryPath: '/path/to/temp/directory',
        reset: true,
        port: 3000,
      });

      expect(createUIFrontEndSpy).toHaveBeenCalledWith({ port: 3000 });
      expect(frontEnd).toBe(uiFrontEnd);
    });
  });
});
