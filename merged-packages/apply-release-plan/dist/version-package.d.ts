import type { ComprehensiveRelease, PackageJSON } from "@changesets/types";
import type { EditJsonOperation } from "./edit-json.js";
type VersionToUpdate = ComprehensiveRelease & {
    dir: string;
};
export type DependencyUpdateOptions = {
    cwd: string;
    updateInternalDependencies: "patch" | "minor";
    onlyUpdatePeerDependentsWhenOutOfRange: boolean;
    bumpVersionsWithWorkspaceProtocolOnly?: boolean | undefined;
    snapshot?: string | boolean | undefined;
};
export declare function getDependencyVersionEdits(packageJson: PackageJSON, versionsToUpdate: VersionToUpdate[], { cwd, updateInternalDependencies, onlyUpdatePeerDependentsWhenOutOfRange, bumpVersionsWithWorkspaceProtocolOnly, snapshot, }: DependencyUpdateOptions): EditJsonOperation[];
export {};
//# sourceMappingURL=version-package.d.ts.map