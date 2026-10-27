#!/usr/bin/env node

import { cli } from './cli.js';
import commands from './commands/index.js';
import { logError } from './log-error.js';

try {
  await cli(process.argv, commands);
} catch (error: unknown) {
  logError(error);
  process.exitCode = 1;
}
