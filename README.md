# MetaMask Release Tools

Tools for releasing MetaMask packages.

## Contributing

See the [Contributor Documentation](./docs) for help on:

- Setting up your development environment
- Working with the monorepo
- Testing changes to a package in other projects
- Issuing new releases
- Creating a new package

## Packages

<!-- start package list -->

- [`@metamask/apply-release-plan`](packages/apply-release-plan)
- [`@metamask/auto-changelog`](packages/auto-changelog)
- [`@metamask/changesets-changelog`](packages/changesets-changelog)
- [`@metamask/changesets-lint`](packages/changesets-lint)
- [`@metamask/changesets-utils`](packages/changesets-utils)
- [`@metamask/create-release-branch`](packages/create-release-branch)

<!-- end package list -->

<!-- start dependency graph -->

```mermaid
%%{ init: { 'flowchart': { 'curve': 'bumpX' } } }%%
graph LR;
linkStyle default opacity:0.5
  apply_release_plan(["@metamask/apply-release-plan"]);
  auto_changelog(["@metamask/auto-changelog"]);
  changesets_changelog(["@metamask/changesets-changelog"]);
  changesets_lint(["@metamask/changesets-lint"]);
  changesets_utils(["@metamask/changesets-utils"]);
  create_release_branch(["@metamask/create-release-branch"]);
  apply_release_plan --> auto_changelog;
  changesets_changelog --> changesets_utils;
  changesets_changelog --> auto_changelog;
  changesets_lint --> changesets_utils;
  changesets_lint --> auto_changelog;
  changesets_utils --> auto_changelog;
  create_release_branch --> apply_release_plan;
  create_release_branch --> auto_changelog;
  create_release_branch --> changesets_utils;
```

<!-- end dependency graph -->

(This section may be regenerated at any time by running `yarn readme-content:update`.)
