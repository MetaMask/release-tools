---
'@metamask/changesets-utils': minor
---

## Added

- Add `parseChangesetSummary` for parsing categorized Changeset summaries, and `GrammarError` for structured parse failures ([#41](https://github.com/MetaMask/release-tools/pull/41))
  - Summaries contain one entry: a level-two `## <category>` heading followed by exactly one top-level bullet. Heading categories match case-insensitively and are returned in canonical spelling as `Added`, `Changed`, `Removed`, `Fixed`, `Security`, or `Deprecated` for plugin use.
