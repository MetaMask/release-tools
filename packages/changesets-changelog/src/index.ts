import { CATEGORIES } from '@metamask/changesets-utils';

import {
  categorizeDependencyReleaseLine,
  categorizeReleaseLine,
  getDependencyReleaseLine,
  getReleaseLine,
  getVersionHeader,
} from './changelog-functions.js';

// `applyReleasePlan` loads the default export as the changelog module and
// expects all categorized changelog functions and metadata on that object.
const changelogFunctions = {
  categories: CATEGORIES,
  categorizeDependencyReleaseLine,
  categorizeReleaseLine,
  getDependencyReleaseLine,
  getReleaseLine,
  getVersionHeader,
};

export default changelogFunctions;
