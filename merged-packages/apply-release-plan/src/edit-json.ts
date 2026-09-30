import { applyEdits, parseTree, printParseErrorCode } from 'jsonc-parser';
import type { EditResult, Node as JsonNode, ParseError } from 'jsonc-parser';

export type EditJsonOperation = {
  keys: string[];
  value: unknown;
};

/**
 * A simple JSON editing utility that preserves formatting. The specified operation keys
 * must exist in the JSON for this implementation.
 *
 * @param json - The JSON document to edit.
 * @param operations - The edits to apply, each addressing a value by its key path.
 * @returns The edited JSON document, with formatting preserved.
 */
export function editJson(
  json: string,
  operations: EditJsonOperation[],
): string {
  const errors: ParseError[] = [];
  const parsed = parseTree(json, errors, {
    allowEmptyContent: false,
    allowTrailingComma: false,
    disallowComments: true,
  });

  if (!parsed) {
    throw new Error('Failed to parse JSON');
  }
  if (errors.length > 0) {
    // Since the first error could cause subsequent errors, we only report the first one
    const error = errors[0];
    throw new Error(
      `Failed to parse JSON at offset ${error.offset}: ${printParseErrorCode(error.error)}`,
    );
  }

  const edits: EditResult = operations.map((op) => {
    const valueNode = getValueNode(parsed, op.keys);
    if (!valueNode) {
      throw new Error(`Key path "${op.keys.join('.')}" not found in JSON`);
    }
    return {
      content: JSON.stringify(op.value),
      offset: valueNode.offset,
      length: valueNode.length,
    };
  });

  return applyEdits(json, edits);
}

function getValueNode(root: JsonNode, keys: string[]): JsonNode | null {
  let node = root;
  for (const key of keys) {
    if (node.type !== 'object') {
      return null;
    }
    const property = node.children?.find(
      (child) =>
        child.type === 'property' &&
        child.children?.length === 2 &&
        child.children[0].value === key,
    );
    const valueNode = property?.children?.[1];
    if (!valueNode) {
      return null;
    }
    node = valueNode;
  }
  return node;
}
