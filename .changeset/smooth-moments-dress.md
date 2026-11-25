---
'@metamask/apply-release-plan': minor
---

## Added

- Add ability to customize changelog categories ([#25](https://github.com/MetaMask/release-tools/pull/25))
  - Changelog modules can export `categorizeReleaseLine` and `categorizeDependencyReleaseLine` to assign lines produced by `getReleaseLine` and `getDependencyReleaseLine` to named sections from an ordered `categories` list, instead of the hardcoded `### Major/Minor/Patch Changes`
