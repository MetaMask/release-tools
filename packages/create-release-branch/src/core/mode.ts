import type { Candidate } from './candidates.js';
import type { ReleaseChoiceError, ReleaseChoices } from './release-rules.js';

/**
 * The name of a release mode.
 */
export type ModeName = 'legacy' | 'changesets';

/**
 * The release that a mode plans from the release choices.
 *
 * @property releases - The new version of every workspace package that is
 * released.
 * @property data - The data that the mode needs to apply the plan. The core
 * does not read it.
 */
export type ModePlan<Data> = {
  releases: { name: string; newVersion: string }[];
  data: Data;
};

/**
 * Either the plan or the problems that prevent the mode from planning.
 */
export type ModePlanResult<Data> =
  | { plan: ModePlan<Data> }
  | { errors: ReleaseChoiceError[] };

/**
 * Decides which packages can be released, plans the release from the release
 * choices, and writes it to the project.
 *
 * @property name - The name of the mode.
 * @property allowEmptyInitializeCommit - Whether the "Initialize Release"
 * commit is created even if `prepare` changes nothing.
 * @property prepare - Changes the project on the first run, before the
 * "Initialize Release" commit.
 * @property listCandidates - Lists the packages that can be released, including
 * the packages that the given choices pull in.
 * @property plan - Plans the release from release choices that passed the
 * shared rules.
 * @property apply - Writes the planned release to the project.
 * @property getReleaseNotes - Returns the release notes of a package.
 */
export type Mode<Data> = {
  name: ModeName;
  allowEmptyInitializeCommit: boolean;
  prepare(): Promise<void>;
  listCandidates(choices?: ReleaseChoices): Promise<Candidate[]>;
  plan(choices: ReleaseChoices): Promise<ModePlanResult<Data>>;
  apply(plan: ModePlan<Data>, newRootVersion: string): Promise<void>;
  getReleaseNotes(packageName: string): Promise<string>;
};
