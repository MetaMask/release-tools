import { main } from './cli/main.js';
import { createCliOutput } from './core/cli-output.js';
import { describeError } from './core/user-facing-error.js';
import { debug } from './utils/misc-utils.js';

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
  const output = createCliOutput({
    stdout: process.stdout,
    stderr: process.stderr,
  });
  const { title, lines } = describeError(error, output.format, {
    debug: debug.enabled,
  });
  output.failure(title, lines);
  process.exitCode = 1;
});
