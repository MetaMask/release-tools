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

- [`@metamask/greetings`](packages/greetings)
- [`@metamask/letter-crafter`](packages/letter-crafter)
- [`@metamask/signatures`](packages/signatures)

<!-- end package list -->

<!-- start dependency graph -->

```mermaid
%%{ init: { 'flowchart': { 'curve': 'bumpX' } } }%%
graph LR;
linkStyle default opacity:0.5
  greetings(["@metamask/greetings"]);
  letter_crafter(["@metamask/letter-crafter"]);
  signatures(["@metamask/signatures"]);
  letter_crafter --> greetings;
  letter_crafter --> signatures;
```

<!-- end dependency graph -->

(This section may be regenerated at any time by running `yarn readme-content:update`.)
