# Introduction

Welcome to your guide on testing Effect-based applications using `bun:test` and the `@domir/bun-test` package. This package simplifies running tests for Effect-based code with Bun test.

In this guide, we'll walk you through setting up the necessary dependencies and provide examples of how to write Effect-based tests using `@domir/bun-test`.

# Requirements

First, ensure you have [`bun`](https://bun.sh/) installed (version `1.6.0` or later).

Next, install the `@domir/bun-test` package, which integrates Effect with Bun test.

```sh
bun add -D @domir/bun-test
```

# Overview

The main entry point is the following import:

```ts
import { it } from "@domir/bun-test"
```

This import enhances the standard `it` function from `bun:test` with several powerful features, including:

| Feature        | Description                                                                                             |
| -------------- | --------------------------------------------------------------------------------------------------------- |
| `it.effect`    | Runs the test in the test environment (`TestClock` and `TestConsole`), providing and closing a `Scope` for you. |
| `it.live`      | Runs the test with the live Effect environment, providing and closing a `Scope` for you.                |
| `it.flakyTest` | Facilitates the execution of tests that might occasionally fail.                                        |

# Limitations

Bun's test runner does not pass an `AbortSignal` into the test function, only an optional `done` callback, so `@domir/bun-test` has no way to interrupt a running fiber when bun's own per-test timeout fires. If a test needs a guaranteed interruption after some duration, use `Effect.timeout` (or `Effect.race` against a delay) inside the effect itself rather than relying on the runner's timeout option.

# Publishing

Build the package first, then publish from the compiled output:

```sh
bun run build
cd dist
bun publish
```

The `directory` field under `publishConfig` in `package.json` is a pnpm convention that redirects `pnpm publish` to that folder automatically. Bun does not read it, so `bun publish` must be run from inside `dist/` directly.

