import express from 'express';
import openBrowser from 'open';
import { join } from 'path';

import type { CliOutput } from './core/cli-output.js';
import {
  checkReleaseChoices,
  normalizeReleaseChoices,
} from './core/release-rules.js';
import type { ReleaseChoices } from './core/release-rules.js';
import { commitAllChanges } from './core/repo.js';
import {
  deduplicateDependencies,
  fixConstraints,
  updateYarnLockfile,
} from './core/yarn-commands.js';
import { getCurrentDirectoryPath } from './dirname.js';
import { Formatter } from './initial-parameters.js';
import { listLegacyCandidates } from './modes/legacy/candidates.js';
import { Package } from './project/package.js';
import type { Project } from './project/project.js';
import {
  restoreChangelogsForSkippedPackages,
  updateChangelogsForChangedPackages,
} from './project/project.js';
import { executeReleasePlan, planRelease } from './release-plan.js';
import { readFile } from './utils/fs.js';
import { createReleaseBranch } from './workflow-operations.js';

const UI_BUILD_DIR = join(getCurrentDirectoryPath(), 'ui');

type UIOptions = {
  project: Project;
  releaseType: 'ordinary' | 'backport';
  defaultBranch: string;
  port: number;
  formatter: Formatter;
  output: CliOutput;
};

/**
 * Starts the UI for the release process.
 *
 * @param options - The options for the UI.
 * @param options.project - The project object.
 * @param options.releaseType - The type of release.
 * @param options.defaultBranch - The default branch name.
 * @param options.port - The port number for the server.
 * @param options.formatter - The formatter to use for formatting the changelog.
 * @param options.output - Where to write user-facing messages.
 */
export async function startUI({
  project,
  releaseType,
  defaultBranch,
  port,
  formatter,
  output,
}: UIOptions): Promise<void> {
  const { version: newReleaseVersion, firstRun } = await createReleaseBranch({
    project,
    releaseType,
  });

  if (firstRun) {
    await updateChangelogsForChangedPackages({ project, formatter, output });
    await commitAllChanges(
      project.directoryPath,
      `Initialize Release ${newReleaseVersion}`,
    );
  }

  const app = createApp({
    project,
    defaultBranch,
    formatter,
    output,
    version: newReleaseVersion,
    closeServer: () => {
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      server.close();
      output.success('Release process completed. Server shutdown.\n');
    },
  });

  const server = app.listen(port, () => {
    const url = `http://localhost:${port}`;

    output.info(`\nAttempting to open UI in browser...`);
    openBrowser(url)
      .then(() => {
        output.info(`\nUI server running at ${url}\n`);
      })
      .catch((error: unknown) => {
        output.error(`\n---------------------------------------------------\n`);
        output.error(`Error automatically opening browser: ${String(error)}\n`);
        output.error(`Please open the following URL manually:\n`);
        output.error(`${url}\n`);
        output.error(`---------------------------------------------------\n\n`);
      });
  });

  return new Promise((resolve, reject) => {
    server.on('error', (error: Error) => {
      output.error(`Failed to start server: ${error.message}\n`);
      reject(error);
    });

    server.on('close', () => {
      resolve();
    });
  });
}

/**
 * Creates an Express application for the UI server.
 *
 * @param options - The options for creating the app.
 * @param options.project - The project object.
 * @param options.defaultBranch - The default branch name.
 * @param options.formatter - The formatter to use for formatting the changelog.
 * @param options.output - Where to write user-facing messages.
 * @param options.version - The release version.
 * @param options.closeServer - The function to close the server.
 * @returns The Express application.
 */
function createApp({
  project,
  defaultBranch,
  formatter,
  output,
  version,
  closeServer,
}: {
  project: Project;
  defaultBranch: string;
  formatter: Formatter;
  output: CliOutput;
  version: string;
  closeServer: () => void;
}): express.Application {
  const app = express();

  app.use(express.static(UI_BUILD_DIR));
  app.use(express.json());

  app.get('/api/packages', (req, res) => {
    const { majorBumps } = req.query;

    const majorBumpsArray =
      typeof majorBumps === 'string'
        ? majorBumps.split(',').filter(Boolean)
        : ((req.query.majorBumps as string[] | undefined) ?? []);

    const majorBumpChoices: ReleaseChoices = Object.fromEntries(
      majorBumpsArray.map((majorBump) => [majorBump, 'major']),
    );

    const packages = listLegacyCandidates(project, majorBumpChoices).map(
      ({ name, currentVersion }) => ({ name, version: currentVersion }),
    );

    res.json(packages);
  });

  app.get('/api/changelog', async (req, res) => {
    try {
      const packageName = req.query.package as string;

      const selectedPackage = Object.values(project.workspacePackages).find(
        (pkg) => pkg.validatedManifest.name === packageName,
      ) as Package;

      const changelogContent = await readFile(selectedPackage.changelogPath);

      res.send(changelogContent);
    } catch (error) {
      output.error(`Changelog error: ${String(error)}\n`);
      res.status(500).send('Internal Server Error');
    }
  });

  app.post(
    '/api/check-packages',
    async (req: express.Request, res: express.Response): Promise<void> => {
      try {
        const releasedPackages = req.body as ReleaseChoices;

        const { dependencyFindings } = checkReleaseChoices(
          project,
          releasedPackages,
        );

        if (Object.keys(dependencyFindings).length > 0) {
          res.json({
            status: 'error',
            errors: dependencyFindings,
          });
          return;
        }

        res.json({ status: 'success' });
      } catch (error) {
        output.error(`Release error: ${String(error)}\n`);
        res.status(400).send('Invalid request');
      }
    },
  );

  app.post(
    '/api/release',
    async (req: express.Request, res: express.Response): Promise<void> => {
      try {
        const releasedPackages = req.body as ReleaseChoices;

        const errors = checkReleaseChoices(
          project,
          releasedPackages,
        ).errors.map(({ message, entryIndex }) =>
          entryIndex === undefined
            ? { message }
            : { message, lineNumber: entryIndex + 2 },
        );

        if (errors.length > 0) {
          res.json({
            status: 'error',
            errors,
          });
          return;
        }

        const releaseSpecificationPackages =
          normalizeReleaseChoices(releasedPackages);

        await restoreChangelogsForSkippedPackages({
          project,
          releaseSpecificationPackages,
          defaultBranch,
        });

        const releasePlan = await planRelease({
          project,
          releaseSpecificationPackages,
          newReleaseVersion: version,
        });
        await executeReleasePlan(project, releasePlan, formatter, output);
        await fixConstraints(project.directoryPath);
        await updateYarnLockfile(project.directoryPath);
        await deduplicateDependencies(project.directoryPath);
        await commitAllChanges(
          project.directoryPath,
          `Update Release ${version}`,
        );

        res.json({ status: 'success' });

        closeServer();
      } catch (error) {
        output.error(`Release error: ${String(error)}\n`);
        res.status(400).send('Invalid request');
      }
    },
  );

  return app;
}
