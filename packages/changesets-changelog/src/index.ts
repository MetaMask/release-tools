// Re-exported as `categories` because the categorized changelog interface in
// `@metamask/apply-release-plan` requires a `categories` export.
export { CATEGORIES as categories } from '@metamask/changesets-utils';

export {
  categorizeDependencyReleaseLine,
  categorizeReleaseLine,
  getDependencyReleaseLine,
  getReleaseLine,
} from './release-line.js';
