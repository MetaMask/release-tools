# Releasing changes

Have changes that you need to release? There are a few things to understand:

- Releases are shared among the teams that maintain this repo. That means **if you work on a team that has codeownership over a package, you are free to create a new release yourself.**
- Releases are not issued on a schedule; **anyone may create a release at any time**. Review the Pull Requests tab on GitHub first to make sure no one else has a release candidate in progress.
- Breaking changes take special consideration. [Read the guide](./breaking-changes.md) on how to prepare and handle them effectively.

## Creating a release branch

This repository uses `create-release-branch` in **Changesets mode**. (The interactive web UI `--interactive` does not support Changesets mode yet, so use the editor workflow.)

1. **Start on `main` with a clean `.changeset` directory.**

   Run:

   ```sh
   yarn create-release-branch
   ```

   The tool creates a branch named `release/<new release version>`, reads pending changesets in `.changeset/`, and opens a YAML "release spec" in your editor.

2. **Select which packages to release.**

   The release spec lists every package that has pending changesets or depends on a released package, along with the version specifier determined by those changesets.
   - Do not change the version specifier for a package. In Changesets mode, the changeset files set each package's version.
   - To leave a package out of this release, remove it from the list (or set it to `intentionally-skip` if another released package depends on it). Its changesets are kept for a later release.

   Once you save and close the release spec, the tool continues. (If no editor could be detected, edit the file manually and run `yarn create-release-branch` again.)

   At that point, the tool:
   - Bumps the root `package.json` version and each selected package's `package.json` version.
   - Generates new `CHANGELOG.md` entries for each released package from its consumed changesets (including workspace dependency bumps).
   - Deletes consumed changesets (and restores residual entries if a changeset targeted both released and unreleased packages).
   - Runs Yarn constraints, `yarn install`, and `yarn dedupe`, then commits the changes.

3. **Review the generated changelogs.**

   Check the new sections in each released package's `CHANGELOG.md` to confirm the wording, categories, and PR links are accurate and helpful for consumers.

   Run validation before pushing:

   ```sh
   yarn changelog:validate
   yarn lint:changesets
   ```

4. **Push and submit a pull request.**

   Create a PR for the `release/<new release version>` branch with a title starting with `Release <new release version>`. Release PRs can be approved by codeowners of the affected packages.

5. **Incorporate any new changes from `main`.**

   If new changes are merged to `main` for packages you are releasing while the release PR is open, update the release branch so those changes and changesets are accounted for.

6. **Merge the release PR and wait for approval.**

   "Squash & Merge" the release PR once approved.

   Merging triggers the [`publish-release` workflow](../../.github/workflows/publish-release.yml) to tag the release commit, notify the [`npm-publishers`](https://github.com/orgs/MetaMask/teams/npm-publishers) team in Slack for approval, and publish the updated packages to NPM.

7. **Verify publication.**

   Once `npm-publishers` approves the release, monitor the workflow run and check NPM to verify all released packages are published.
