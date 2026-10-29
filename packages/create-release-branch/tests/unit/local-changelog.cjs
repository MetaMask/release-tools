'use strict';

// Copied into `.changeset/` of Changesets fixtures, so it must stay a plain
// CommonJS module without imports.

const categories = [
  'Added',
  'Changed',
  'Deprecated',
  'Removed',
  'Fixed',
  'Security',
];

/**
 * Reads a summary made of a `## <category>` heading and one
 * `- <text> (#<number>)` bullet.
 *
 * @param {{ id: string, summary: string }} changeset - The Changeset.
 * @returns {{ category: string, text: string, pullRequest: string }} The parts
 * of the summary.
 */
function parseSummary(changeset) {
  const match = /^## (\w+)\n+- (.+) \(#(\d+)\)$/u.exec(
    changeset.summary.trim(),
  );
  if (match === null || !categories.includes(match[1])) {
    throw new Error(`Unsupported summary in changeset ${changeset.id}`);
  }
  return { category: match[1], text: match[2], pullRequest: match[3] };
}

module.exports = {
  categories,
  getVersionHeader: (release) => `## [${release.newVersion}]`,
  getReleaseLine: async (changeset, type, options) => {
    const { text, pullRequest } = parseSummary(changeset);
    const prefix = type === 'major' ? '**BREAKING:** ' : '';
    return `- ${prefix}${text} ([#${pullRequest}](https://github.com/${options.repo}/pull/${pullRequest}))`;
  },
  categorizeReleaseLine: (line, changeset) => [
    { category: parseSummary(changeset).category, line },
  ],
  getDependencyReleaseLine: async (_changesets, dependencies) =>
    dependencies
      .map(
        ({ name, oldVersion, newVersion }) =>
          `- Bump \`${name}\` from \`${oldVersion}\` to \`${newVersion}\``,
      )
      .join('\n'),
  categorizeDependencyReleaseLine: (line) => [{ category: 'Changed', line }],
};
