import type { Packages, Config, ReleasePlan } from "@changesets/types";
export declare function applyReleasePlan(releasePlan: ReleasePlan, packages: Packages, config?: Config, snapshot?: string | boolean, contextDir?: string): Promise<string[]>;
/** @deprecated Use named export `applyReleasePlan` instead */
declare const applyReleasePlanDefault: typeof applyReleasePlan;
export default applyReleasePlanDefault;
//# sourceMappingURL=index.d.ts.map