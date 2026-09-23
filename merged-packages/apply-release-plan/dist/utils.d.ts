import type { ComprehensiveRelease } from "@changesets/types";
export declare function shouldUpdateDependencyBasedOnConfig(cwd: string, release: ComprehensiveRelease & {
    dir: string;
}, { depVersionRange, depType, }: {
    depVersionRange: string;
    depType: "dependencies" | "devDependencies" | "peerDependencies" | "optionalDependencies";
}, { minReleaseType, onlyUpdatePeerDependentsWhenOutOfRange, }: {
    minReleaseType: "patch" | "minor";
    onlyUpdatePeerDependentsWhenOutOfRange: boolean;
}): boolean;
export declare function capitalize(str: string): string;
//# sourceMappingURL=utils.d.ts.map