import { CATEGORIES } from '@metamask/changesets-utils';

import {
  categorizeDependencyReleaseLine,
  categorizeReleaseLine,
  getDependencyReleaseLine,
  getReleaseLine,
} from './release-line.js';

// Exported as `categories` because the categorized changelog interface in
// `@metamask/apply-release-plan` requires a `categories` export.
export const categories = CATEGORIES;

export {
  categorizeDependencyReleaseLine,
  categorizeReleaseLine,
  getDependencyReleaseLine,
  getReleaseLine,
};

const changelogFunctions = {
  categories,
  categorizeDependencyReleaseLine,
  categorizeReleaseLine,
  getDependencyReleaseLine,
  getReleaseLine,
};

export default changelogFunctions;
