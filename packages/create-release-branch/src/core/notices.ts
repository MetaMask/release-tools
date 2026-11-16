import type { CliOutput } from './cli-output.js';

/**
 * A warning that the core prints once, with the items it applies to, such as
 * package names.
 *
 * @property title - What happened.
 * @property items - What it happened to.
 */
export type Notice = { title: string; items: string[] };

/**
 * Prints each notice as one warning with its items.
 *
 * @param output - Where to write user-facing messages.
 * @param notices - The notices.
 */
export function printNotices(output: CliOutput, notices: Notice[]): void {
  for (const { title, items } of notices) {
    output.warnList(title, items);
  }
}
