/**
 * @since 1.0.0
 */
import * as Cause from "effect/Cause"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import { flow, identity, pipe } from "effect/Function"
import * as Layer from "effect/Layer"
import * as Logger from "effect/Logger"
import * as ManagedRuntime from "effect/ManagedRuntime"
import { isObject } from "effect/Predicate"
import * as Schedule from "effect/Schedule"
import * as Schema from "effect/Schema"
import * as Scope from "effect/Scope"
import { FastCheck as fc, TestClock } from "effect/testing"
import * as B from "../bun.js"
import type * as BunTest from "../index.js"

const runPromise = () => <E, A>(effect: Effect.Effect<A, E>) =>
  Effect.gen(function*() {
    const exitFiber = yield* Effect.forkChild(Effect.exit(effect))

    const exit = yield* Fiber.join(exitFiber)
    if (Exit.isSuccess(exit)) {
      return () => exit.value
    } else {
      const errors = Cause.prettyErrors(exit.cause)
      for (let i = 1; i < errors.length; i++) {
        yield* Effect.logError(errors[i])
      }
      return () => {
        throw errors[0]
      }
    }
  }).pipe(Effect.runPromise).then((f) => f())

/** @internal */
const runTest = () => <E, A>(effect: Effect.Effect<A, E>) => runPromise()(effect)

/** @internal */
const TestEnv = TestClock.layer().pipe(
  Layer.provide(Logger.layer([]))
)

/** @internal */
const testOptions = (timeout?: number | B.TestOptions) => typeof timeout === "number" ? { timeout } : timeout ?? {}

/** @internal */
const makeTester = <R>(
  mapEffect: <A, E>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E, never>,
  it: B.TestAPI = B.it
): BunTest.BunTest.Tester<R> => {
  const run = <A, E, TestArgs extends Array<unknown>>(
    args: TestArgs,
    self: BunTest.BunTest.TestFunction<A, E, R, TestArgs>
  ) =>
    pipe(
      Effect.suspend(() => self(...args)),
      mapEffect,
      runTest()
    )

  const f: BunTest.BunTest.Test<R> = (name, self, timeout) => it(name, () => run([], self), testOptions(timeout))

  const skip: BunTest.BunTest.Tester<R>["only"] = (name, self, timeout) =>
    it.skip(name, () => run([] as any, self), testOptions(timeout))

  const skipIf: BunTest.BunTest.Tester<R>["skipIf"] = (condition: any) => (name, self, timeout) =>
    it.skipIf(condition)(name, () => run([] as any, self), testOptions(timeout))

  const runIf: BunTest.BunTest.Tester<R>["runIf"] = (condition) => (name, self, timeout) =>
    it.skipIf(!condition)(name, () => run([] as any, self), testOptions(timeout))

  const only: BunTest.BunTest.Tester<R>["only"] = (name, self, timeout) =>
    it.only(name, () => run([] as any, self), testOptions(timeout))

  const each: BunTest.BunTest.Tester<R>["each"] = (cases) => (name, self, timeout) =>
    it.each(cases as any)(
      name,
      (args) => run([args], self) as any,
      testOptions(timeout)
    )

  const fails: BunTest.BunTest.Tester<R>["fails"] = (name, self, timeout) =>
    it.failing(name, () => run([] as any, self), testOptions(timeout))

  const prop: BunTest.BunTest.Tester<R>["prop"] = (name, arbitraries, self, timeout) => {
    if (Array.isArray(arbitraries)) {
      const arbs = arbitraries.map((arbitrary) => Schema.isSchema(arbitrary) ? Schema.toArbitrary(arbitrary) : arbitrary)
      return it(
        name,
        () =>
          // @ts-ignore
          fc.assert(
            // @ts-ignore
            fc.asyncProperty(...arbs, (...as) => run([as as any], self)),
            isObject(timeout) ? (timeout as any)?.fastCheck : {}
          ),
        testOptions(timeout)
      )
    }

    const arbs = fc.record(
					Object.entries(arbitraries).reduce(
						(result, [key, arbitrary]) => {
							result[key] = Schema.isSchema(arbitrary)
								? Schema.toArbitrary(arbitrary)
								: arbitrary;
							return result;
						},
						{} as Record<string, fc.Arbitrary<any>>,
					),
    )

    return it(
      name,
      () =>
        // @ts-ignore
        fc.assert(
          fc.asyncProperty(arbs, (...as) =>
            // @ts-ignore
            run([as[0] as any], self)),
          isObject(timeout) ? (timeout as any)?.fastCheck : {}
        ),
      testOptions(timeout)
    )
  }

  return Object.assign(f, { runIf, fails, only, skip, skipIf, each, prop })
}

/** @internal */
export const prop: BunTest.BunTest.Methods["prop"] = (name, arbitraries, self, timeout) => {
  if (Array.isArray(arbitraries)) {
    const arbs = arbitraries.map((arbitrary) => Schema.isSchema(arbitrary) ? Schema.toArbitrary(arbitrary) : arbitrary)
    return B.it(
      name,
      // @ts-ignore
      () => fc.assert(fc.property(...arbs, (...as) => self(as)), isObject(timeout) ? timeout?.fastCheck : {}),
      testOptions(timeout)
    )
  }

  const arbs = fc.record(
    Object.keys(arbitraries).reduce(function(result, key) {
      result[key] = Schema.isSchema(arbitraries[key]) ? Schema.toArbitrary(arbitraries[key]) : arbitraries[key]
      return result
    }, {} as Record<string, fc.Arbitrary<any>>)
  )

  return B.it(
    name,
    // @ts-ignore
    () => fc.assert(fc.property(arbs, (as) => self(as)), isObject(timeout) ? timeout?.fastCheck : {}),
    testOptions(timeout)
  )
}

/** @internal */
export const layer = <R, E, const ExcludeTestServices extends boolean = false>(
  layer_: Layer.Layer<R, E>,
  options?: {
    readonly memoMap?: Layer.MemoMap
    readonly timeout?: Duration.DurationInput
    readonly excludeTestServices?: ExcludeTestServices
  }
): {
  (f: (it: BunTest.BunTest.MethodsNonLive<R, ExcludeTestServices>) => void): void
  (
    name: string,
    f: (it: BunTest.BunTest.MethodsNonLive<R, ExcludeTestServices>) => void
  ): void
} =>
(
  ...args: [
    name: string,
    f: (
      it: BunTest.BunTest.MethodsNonLive<R, ExcludeTestServices>
    ) => void
  ] | [
    f: (it: BunTest.BunTest.MethodsNonLive<R, ExcludeTestServices>) => void
  ]
) => {
  const excludeTestServices = options?.excludeTestServices ?? false
  const withTestEnv = excludeTestServices
    ? layer_ as Layer.Layer<R | TestClock.TestClock, E>
    : Layer.provideMerge(layer_, TestEnv)
  const memoMap = options?.memoMap ?? Layer.makeMemoMapUnsafe()
  const managedRuntime = ManagedRuntime.make(withTestEnv.pipe(Layer.orDie), { memoMap })
  // Cache the context locally so that even after managedRuntime.dispose() the
  // context remains accessible. This is important because nested `it.layer` calls
  // mutate B.it in-place and can overwrite the `effect` method with a reference
  // to the inner layer's context. By caching separately we avoid "ManagedRuntime
  // disposed" errors when outer-layer tests run after an inner layer is torn down.
  let layerContext: Context.Context<R | TestClock.TestClock> | undefined

  const makeIt = (it: B.TestAPI): BunTest.BunTest.MethodsNonLive<R, ExcludeTestServices> =>
    Object.assign(it, {
      effect: makeTester<TestClock.TestClock | R>(
        (effect) => Effect.suspend(() =>
          layerContext
            ? effect.pipe(Effect.provide(layerContext))
            : Effect.flatMap(managedRuntime.contextEffect, (context) => effect.pipe(Effect.provide(context)))
        ),
        it
      ),

      prop,

      scoped: makeTester<TestClock.TestClock | Scope.Scope | R>(
        (effect) =>
          Effect.suspend(() =>
            layerContext
              ? effect.pipe(Effect.scoped, Effect.provide(layerContext))
              : Effect.flatMap(managedRuntime.contextEffect, (context) =>
                  effect.pipe(
                    Effect.scoped,
                    Effect.provide(context)
                  ))
          ),
        it
      ),
      flakyTest,
      layer<R2, E2>(nestedLayer: Layer.Layer<R2, E2, R>, options?: {
        readonly timeout?: Duration.DurationInput
      }) {
        return layer(Layer.provideMerge(nestedLayer, withTestEnv), { ...options, memoMap, excludeTestServices })
      }
    })

  // Buns beforeAll and afterAll need to be called in a describe block
  // to reliably run before and after all tests. In that case we just use an empty label.
  const label = args.length === 1 ? "" : args[0]

  return B.describe(label, () => {
    B.beforeAll(async () => {
      layerContext = await managedRuntime.context()
    })
    B.afterAll(() => managedRuntime.dispose())
    return (args.length === 1 ? args[0] : args[1])(makeIt(B.it))
  })
}

/** @internal */
export const flakyTest = <A, E, R>(
  self: Effect.Effect<A, E, R>,
  timeout: Duration.DurationInput = Duration.seconds(30)
) =>
  pipe(
    Effect.catchAllDefect(self, Effect.fail),
    Effect.retry(
      pipe(
        Schedule.recurs(10),
        Schedule.compose(Schedule.elapsed),
        Schedule.whileOutput(Duration.lessThanOrEqualTo(timeout))
      )
    ),
    Effect.orDie
  )

/** @internal */
export const makeMethods = (it: B.TestAPI): BunTest.BunTest.Methods =>
  Object.assign(it, {
    effect: makeTester<TestClock.TestClock>(Effect.provide(TestEnv), it),
    scoped: makeTester<TestClock.TestClock | Scope.Scope>(flow(Effect.scoped, Effect.provide(TestEnv)), it),
    live: makeTester<never>(identity, it),
    scopedLive: makeTester<Scope.Scope>(Effect.scoped, it),
    flakyTest,
    layer,
    prop
  })

/** @internal */
export const {
  /** @internal */
  effect,
  /** @internal */
  live,
  /** @internal */
  scoped,
  /** @internal */
  scopedLive
} = makeMethods(B.it)
