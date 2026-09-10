# @domir/bun-test

## 3.0.0

### Major Changes

- Move the `effect` peer dependency from `^4.0.0-beta.70` to `^4.0.0-rc.112`.

### Patch Changes

- Run every package script with `bun run` instead of `pnpm`.
- Fix `it.prop` and `it.effect.prop` (array and record forms) to call the `Schema.toArbitrary` factory with the `fast-check` module, matching effect rc.112's `Schema.toArbitrary(schema)(fc)` shape. Passing a `Schema` through these testers previously produced a factory function instead of a fast-check `Arbitrary`, which broke property tests using schema arbitraries at runtime.
- Fix `test/index.test.ts`: a leftover `describe.only("layer", ...)` was hiding every other test in the file from the runner; it now runs as a plain `describe`, so `bun run test` exercises the whole suite again.
- Fix `it.effect.each` and `it.live.each` to hand array cases to the test function whole, matching vitest's `it.for`. bun's `it.each` spreads array rows into positional arguments, so `[[1, 2]]` previously reached the test as `1`.
- Fix `throws` and `throwsAsync` in `utils`: a thunk that does not throw now fails the assertion instead of passing silently, matching `@effect/vitest`.
- Restore the README usage guide, ported from `@effect/vitest` 4.0.0-rc.112 and adapted to bun.
- Align internals and docs with `@effect/vitest` 4.0.0-rc.112 (`Object.hasOwn` in the `it` proxy, `Record.assignProperty` in `prop`, the `layer` doc example).
- Skip the "interrupts on timeout" runner-timeout simulation under bun (`it.live.skip`, was `it.live.fails`): bun 1.3.14's `test.failing` does not flip a runner-timeout failure the way rstest/vitest do, so the test cannot pass as written under bun.
