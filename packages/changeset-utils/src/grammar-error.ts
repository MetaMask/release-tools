/**
 * An error thrown when a Changeset summary violates the summary grammar.
 *
 * Carries structured details so consumers can surface precise diagnostics:
 * the 1-based source line, a stable machine-readable rule identifier, and a
 * human-oriented hint describing how to fix the problem.
 */
export class GrammarError extends Error {
  /**
   * The 1-based line number in the summary where the violation occurred.
   */
  readonly line: number;

  /**
   * A stable, machine-readable identifier for the violated grammar rule
   * (e.g. `'unknown-category'`).
   */
  readonly rule: string;

  /**
   * A human-oriented suggestion for how to fix the violation.
   */
  readonly hint: string;

  constructor(message: string, line: number, rule: string, hint: string) {
    super(message);
    this.name = 'GrammarError';
    this.line = line;
    this.rule = rule;
    this.hint = hint;
  }
}
