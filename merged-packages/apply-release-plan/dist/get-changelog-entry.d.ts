import type { ChangelogFunctions, ModCompWithPackage, NewChangesetWithCommit } from "@changesets/types";
type ChangelogLines = {
    major: Array<Promise<string>>;
    minor: Array<Promise<string>>;
    patch: Array<Promise<string>>;
};
export declare function getChangelogEntry(cwd: string, release: ModCompWithPackage, releases: ModCompWithPackage[], changesets: NewChangesetWithCommit[], changelogFuncs: ChangelogFunctions, changelogOpts: null | Record<string, unknown>, { updateInternalDependencies, onlyUpdatePeerDependentsWhenOutOfRange, }: {
    updateInternalDependencies: "patch" | "minor";
    onlyUpdatePeerDependentsWhenOutOfRange: boolean;
}): Promise<string | null>;
export declare function generateMarkdownForVersionType(type: keyof ChangelogLines, lines: Array<string>): string | undefined;
export {};
//# sourceMappingURL=get-changelog-entry.d.ts.map