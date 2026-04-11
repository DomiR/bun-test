/**
 * @since 1.0.0
 */
import type * as Duration from "effect/Duration"
import type * as Effect from "effect/Effect"
import type * as Layer from "effect/Layer"
import type * as Schema from "effect/Schema"
import type * as Scope from "effect/Scope"
import type { FastCheck as FC, TestClock } from "effect/testing"
import * as B from "./bun.js"
import * as internal from "./internal/internal.js"

/**
 * @since 1.0.0
 */
export * from "./bun.js"

/**
 * @since 1.0.0
 */
export interface API extends B.TestAPI {}

/**
 * @since 1.0.0
 */
export namespace BunTest {
  /**
   * @since 1.0.0
   */
  export interface TestFunction<A, E, R, TestArgs extends Array<any>> {
    (...args: TestArgs): Effect.Effect<A, E, R>
  }

  /**
   * @since 1.0.0
   */
  export interface Test<R> {
    <A, E>(
      name: string,
      self: TestFunction<A, E, R, []>,
      timeout?: number | B.TestOptions
    ): void
  }

  /**
   * @since 1.0.0
   */
  export type Arbitraries =
    | Array<Schema.Top | FC.Arbitrary<any>>
    | { [K in string]: Schema.Top | FC.Arbitrary<any> }

  /**
   * @since 1.0.0
   */
  export interface Tester<R> extends BunTest.Test<R> {
    skip: BunTest.Test<R>
    skipIf: (condition: unknown) => BunTest.Test<R>
    runIf: (condition: unknown) => BunTest.Test<R>
    only: BunTest.Test<R>
    each: <T>(
      cases: ReadonlyArray<T>
    ) => <A, E>(name: string, self: TestFunction<A, E, R, Array<T>>, timeout?: number | B.TestOptions) => void
    fails: BunTest.Test<R>

    /**
     * @since 1.0.0
     */
    prop: <const Arbs extends Arbitraries, A, E>(
      name: string,
      arbitraries: Arbs,
      self: TestFunction<
        A,
        E,
        R,
        [
          { [K in keyof Arbs]: Arbs[K] extends FC.Arbitrary<infer T> ? T : Schema.Schema.Type<Arbs[K]> }
        ]
      >,
      timeout?:
        | number
        | B.TestOptions & {
          fastCheck?: FC.Parameters<
            { [K in keyof Arbs]: Arbs[K] extends FC.Arbitrary<infer T> ? T : Schema.Schema.Type<Arbs[K]> }
          >
        }
    ) => void
  }

  /**
   * @since 1.0.0
   */
  export interface MethodsNonLive<R = never, ExcludeTestServices extends boolean = false> extends API {
    readonly effect: BunTest.Tester<(ExcludeTestServices extends true ? never : TestClock.TestClock) | R>
    readonly flakyTest: <A, E, R2>(
      self: Effect.Effect<A, E, R2>,
      timeout?: Duration.DurationInput
    ) => Effect.Effect<A, never, R2>
    readonly scoped: BunTest.Tester<
      (ExcludeTestServices extends true ? never : TestClock.TestClock) | Scope.Scope | R
    >
    readonly layer: <R2, E>(layer: Layer.Layer<R2, E, R>, options?: {
      readonly timeout?: Duration.DurationInput
    }) => {
      (f: (it: BunTest.MethodsNonLive<R | R2, ExcludeTestServices>) => void): void
      (
        name: string,
        f: (it: BunTest.MethodsNonLive<R | R2, ExcludeTestServices>) => void
      ): void
    }

    /**
     * @since 1.0.0
     */
    readonly prop: <const Arbs extends Arbitraries>(
      name: string,
      arbitraries: Arbs,
      self: (
        properties: { [K in keyof Arbs]: Arbs[K] extends FC.Arbitrary<infer T> ? T : Schema.Schema.Type<Arbs[K]> }
      ) => void,
      timeout?:
        | number
        | B.TestOptions & {
          fastCheck?: FC.Parameters<
            { [K in keyof Arbs]: Arbs[K] extends FC.Arbitrary<infer T> ? T : Schema.Schema.Type<Arbs[K]> }
          >
        }
    ) => void
  }

  /**
   * @since 1.0.0
   */
  export interface Methods<R = never> extends MethodsNonLive<R> {
    readonly live: BunTest.Tester<R>
    readonly scopedLive: BunTest.Tester<Scope.Scope | R>
  }
}

/**
 * @since 1.0.0
 */
export const effect: BunTest.Tester<TestClock.TestClock> = internal.effect

/**
 * @since 1.0.0
 */
export const scoped: BunTest.Tester<TestClock.TestClock | Scope.Scope> = internal.scoped

/**
 * @since 1.0.0
 */
export const live: BunTest.Tester<never> = internal.live

/**
 * @since 1.0.0
 */
export const scopedLive: BunTest.Tester<Scope.Scope> = internal.scopedLive

/**
 * Share a `Layer` between multiple tests, optionally wrapping
 * the tests in a `describe` block if a name is provided.
 *
 * @since 1.0.0
 *
 * ```ts
 * import { expect, layer } from "@domir/bun-test"
 * import { Context, Effect, Layer } from "effect"
 *
 * class Foo extends Context.Tag("Foo")<Foo, "foo">() {
 *   static Live = Layer.succeed(Foo, "foo")
 * }
 *
 * class Bar extends Context.Tag("Bar")<Bar, "bar">() {
 *   static Live = Layer.effect(
 *     Bar,
 *     Effect.map(Foo, () => "bar" as const)
 *   )
 * }
 *
 * layer(Foo.Live)("layer", (it) => {
 *   it.effect("adds context", () =>
 *     Effect.gen(function* () {
 *       const foo = yield* Foo
 *       expect(foo).toEqual("foo")
 *     })
 *   )
 *
 *   it.layer(Bar.Live)("nested", (it) => {
 *     it.effect("adds context", () =>
 *       Effect.gen(function* () {
 *         const foo = yield* Foo
 *         const bar = yield* Bar
 *         expect(foo).toEqual("foo")
 *         expect(bar).toEqual("bar")
 *       })
 *     )
 *   })
 * })
 * ```
 */
export const layer: <R, E, const ExcludeTestServices extends boolean = false>(
  layer_: Layer.Layer<R, E>,
  options?: {
    readonly memoMap?: Layer.MemoMap
    readonly timeout?: Duration.DurationInput
    readonly excludeTestServices?: ExcludeTestServices
  }
) => {
  (f: (it: BunTest.MethodsNonLive<R, ExcludeTestServices>) => void): void
  (name: string, f: (it: BunTest.MethodsNonLive<R, ExcludeTestServices>) => void): void
} = internal.layer

/**
 * @since 1.0.0
 */
export const flakyTest: <A, E, R>(
  self: Effect.Effect<A, E, R>,
  timeout?: Duration.DurationInput
) => Effect.Effect<A, never, R> = internal.flakyTest

/**
 * @since 1.0.0
 */
export const prop: BunTest.Methods["prop"] = internal.prop

/**
 * @since 1.0.0
 */

/** @ignored */
const methods = { effect, live, flakyTest, scoped, scopedLive, layer, prop } as const

/**
 * @since 1.0.0
 */
export const it: BunTest.Methods & B.TestFunction = Object.assign(B.it, methods)

/**
 * @since 1.0.0
 */
export const makeMethods: (it: B.TestAPI) => BunTest.Methods = internal.makeMethods
