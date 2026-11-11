import express from 'express';
import openBrowser from 'open';
import { join } from 'path';

import type { FrontEnd, ReleaseContext } from '../../core/front-end.js';
import type { ReleaseChoices } from '../../core/release-rules.js';
import {
  applyRelease,
  checkChoices,
  finishRelease,
  startRelease,
} from '../../core/release-steps.js';
import { getCurrentDirectoryPath } from '../../dirname.js';

const UI_BUILD_DIR = join(getCurrentDirectoryPath(), 'ui');

/**
 * Creates the front end that collects the release choices through a web UI
 * that it serves locally and opens in the browser.
 *
 * @param args - The arguments.
 * @param args.port - The port number for the server.
 * @returns The front end.
 */
export function createUIFrontEnd({ port }: { port: number }): FrontEnd {
  return {
    async run(context) {
      await startUI({ ...context, port });
    },
  };
}

/**
 * Starts the UI for the release process.
 *
 * @param options - The options for the UI.
 * @param options.port - The port number for the server.
 * @returns A promise that resolves when the server closes.
 */
async function startUI({
  port,
  ...context
}: ReleaseContext & { port: number }): Promise<void> {
  const { project, mode, releaseType, output } = context;
  const { newReleaseVersion } = await startRelease({
    project,
    releaseType,
    mode,
    output,
  });

  const app = createApp({
    context,
    newReleaseVersion,
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
 * @param options.context - What the release needs: the project, the mode, and
 * where to write user-facing messages.
 * @param options.newReleaseVersion - The version of the new release.
 * @param options.closeServer - The function to close the server.
 * @returns The Express application.
 */
export function createApp({
  context,
  newReleaseVersion,
  closeServer,
}: {
  context: ReleaseContext;
  newReleaseVersion: string;
  closeServer: () => void;
}): express.Application {
  const { project, mode, output } = context;
  const app = express();

  app.use(express.static(UI_BUILD_DIR));
  app.use(express.json());

  app.get('/api/packages', async (req, res, next) => {
    try {
      const { majorBumps } = req.query;

      const majorBumpsArray =
        typeof majorBumps === 'string'
          ? majorBumps.split(',').filter(Boolean)
          : ((req.query.majorBumps as string[] | undefined) ?? []);

      const majorBumpChoices: ReleaseChoices = Object.fromEntries(
        majorBumpsArray.map((majorBump) => [majorBump, 'major']),
      );

      const packages = (await mode.listCandidates(majorBumpChoices)).map(
        ({ name, currentVersion }) => ({ name, version: currentVersion }),
      );

      res.json(packages);
    } catch (error) {
      // Express 4 does not catch errors from async handlers.
      return next(error);
    }
  });

  app.get('/api/changelog', async (req, res) => {
    try {
      const packageName = req.query.package as string;

      const changelogContent = await mode.getReleaseNotes(packageName);

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

        const { dependencyFindings } = await checkChoices({
          project,
          mode,
          choices: releasedPackages,
        });

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

        const result = await checkChoices({
          project,
          mode,
          choices: releasedPackages,
        });

        if (!('plan' in result)) {
          res.json({
            status: 'error',
            errors: result.errors.map(({ message, entryIndex }) =>
              entryIndex === undefined
                ? { message }
                : { message, lineNumber: entryIndex + 2 },
            ),
          });
          return;
        }

        await applyRelease({
          mode,
          plan: result.plan,
          newReleaseVersion,
          output,
        });
        await finishRelease({ project, newReleaseVersion, output });

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
