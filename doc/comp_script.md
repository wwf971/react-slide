## Component Creation Commands

`frontend/src/comp_script` contains slash commands used by `CompSwitcher` when creating a component on a slide page.

Current command:

`/title My Title`

This creates a `CompTextSingleline` component with title-sized text and places it near the top of the page.

Flow:

1. `Page` opens `CompSwitcher` at the requested page position.
2. `CompSwitcher` lists normal component names and command options.
3. If the input starts with a known command, `slidesStore.confirmTemporarySwitcher` resolves it through `comp_script`.
4. The resolved component name, component data, and placement options are passed to normal component creation.

To add another command, add a file in `frontend/src/comp_script` and register it from `index.ts`.
