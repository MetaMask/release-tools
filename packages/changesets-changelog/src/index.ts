import { CATEGORIES } from '@metamask/changesets-utils';

import {
  categorizeDependencyReleaseLine,
  categorizeReleaseLine,
  getDependencyReleaseLine,
  getReleaseLine,
} from './release-line.js';

// `applyReleasePlan` loads the default export as the changelog module and
// expects all categorized changelog functions and metadata on that object.
const changelogFunctions = {
  categories: CATEGORIES,
  categorizeDependencyReleaseLine,
  categorizeReleaseLine,
  getDependencyReleaseLine,
  getReleaseLine,
};

export default changelogFunctions;
