export interface EditJsonOperation {
    keys: string[];
    value: unknown;
}
/**
 * A simple JSON editing utility that preserves formatting. They specified operation keys
 * must exist in the JSON for this implementation.
 */
export declare function editJson(json: string, operations: EditJsonOperation[]): string;
//# sourceMappingURL=edit-json.d.ts.map