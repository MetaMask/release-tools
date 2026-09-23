# `@metamask/apply-release-plan`

This takes a `releasePlan` object for changesets and applies the expected changes from that
release. This includes updating package versions, and updating changelogs.

This package was forked from [`@changesets/apply-release-plan@8.1.1`](https://github.com/changesets/changesets/tree/%40changesets%2Fapply-release-plan%408.1.1/packages/apply-release-plan), with its git history preserved. For changes before the fork, see [the upstream changelog](https://github.com/changesets/changesets/blob/%40changesets%2Fapply-release-plan%408.1.1/packages/apply-release-plan/CHANGELOG.md).

## Installation

`yarn add @metamask/apply-release-plan`

or

`npm install @metamask/apply-release-plan`

## Usage

```ts
import applyReleasePlan from "@metamask/apply-release-plan";
import type { ReleasePlan, Config, Packages } from "@changesets/types";

await applyReleasePlan(
    // The release plan to be applied - see @changesets/types for information about its shape
    releasePlan: ReleasePlan,

    // All information about to the repository packages - see @changesets/types for information about its shape
    packages: Packages,

    // A valid @changesets/config config - see @changesets/types for information about its shape
    config: Config
);
```

Note that `apply-release-plan` does not validate the release plan's accuracy.

To generate a release plan from written changesets use `@changesets/get-release-plan`

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/release-tools#readme).
