import util from 'util';

import { main } from './cli/main.js';
import { createCliOutput } from './core/cli-output.js';

/**
 * The entrypoint to this tool.
 */
async function cli(): Promise<void> {
  await main({
    argv: process.argv,
    cwd: process.cwd(),
    stdout: process.stdout,
    stderr: process.stderr,
  });
}

cli().catch((error) => {
  createCliOutput({ stdout: process.stdout, stderr: process.stderr }).error(
    `${util.inspect(error)}\n`,
  );
  process.exitCode = 1;
});
