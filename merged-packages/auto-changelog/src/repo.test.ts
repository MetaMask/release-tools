import path from 'path';
/* eslint-disable node/no-process-env */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { findNearestPackageJson, getRepositoryUrl } from './repo.js';

describe('getRepositoryUrl', () => {
  const originalNpmPackageRepositoryUrl =
    process.env.npm_package_repository_url;
  const originalProjectCwd = process.env.PROJECT_CWD;

  afterEach(() => {
    if (originalNpmPackageRepositoryUrl === undefined) {
      delete process.env.npm_package_repository_url;
    } else {
      process.env.npm_package_repository_url = originalNpmPackageRepositoryUrl;
    }
    if (originalProjectCwd === undefined) {
      delete process.env.PROJECT_CWD;
    } else {
      process.env.PROJECT_CWD = originalProjectCwd;
    }
  });

  it('reads the repository URL from an environment variable', () => {
    process.env.npm_package_repository_url =
      'https://github.com/metamask/auto-changelog';

    expect(getRepositoryUrl()).toBe(
      'https://github.com/metamask/auto-changelog',
    );
  });

  it('reads the repository URL from an environment variable (.git suffix)', () => {
    process.env.npm_package_repository_url =
      'https://github.com/metamask/auto-changelog.git';

    expect(getRepositoryUrl()).toBe(
      'https://github.com/metamask/auto-changelog',
    );
  });

  it('reads the repository URL from the package.json', () => {
    process.env.npm_package_repository_url = '';
    process.env.PROJECT_CWD = path.resolve(import.meta.dirname, '..');

    expect(getRepositoryUrl()).toBe(
      'https://github.com/MetaMask/release-tools',
    );
  });

  it('falls back to the package.json in the current working directory when no env var is set', () => {
    delete process.env.npm_package_repository_url;
    delete process.env.PROJECT_CWD;
    // The auto-changelog project root, which has a `repository` field.
    vi.spyOn(process, 'cwd').mockReturnValue(
      path.resolve(import.meta.dirname, '..'),
    );

    expect(getRepositoryUrl()).toBe(
      'https://github.com/MetaMask/release-tools',
    );
  });

  it('walks up from the current working directory to find the nearest package.json', () => {
    delete process.env.npm_package_repository_url;
    delete process.env.PROJECT_CWD;
    // A nested directory that has no package.json of its own; the search must
    // walk up to the project root.
    vi.spyOn(process, 'cwd').mockReturnValue(import.meta.dirname);

    expect(getRepositoryUrl()).toBe(
      'https://github.com/MetaMask/release-tools',
    );
  });
});

describe('findNearestPackageJson', () => {
  const projectRoot = path.resolve(import.meta.dirname, '..');

  it('finds the package.json in the given directory', () => {
    expect(findNearestPackageJson(projectRoot)).toBe(
      path.join(projectRoot, 'package.json'),
    );
  });

  it('walks up to the nearest package.json from a nested directory', () => {
    // `import.meta.dirname` (the `src` directory) has no package.json of its own.
    expect(findNearestPackageJson(import.meta.dirname)).toBe(
      path.join(projectRoot, 'package.json'),
    );
  });

  it('defaults to the current working directory', () => {
    vi.spyOn(process, 'cwd').mockReturnValue(import.meta.dirname);

    expect(findNearestPackageJson()).toBe(
      path.join(projectRoot, 'package.json'),
    );
  });

  it('returns null when no package.json exists up to the filesystem root', () => {
    expect(findNearestPackageJson(path.parse(process.cwd()).root)).toBeNull();
  });
});
