---
'@metamask/apply-release-plan': patch
---

## Changed

- When inserting new release entries in a changelog, accommodate various changelog formats by preserving a title and/or preamble (especially if no version headings exist yet) and allowing for more flexibility in how versions are formatted in headings ([#25](https://github.com/MetaMask/release-tools/pull/25))
