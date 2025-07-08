/**
 * @since 1.0.0
 */
import * as Arbitrary from "effect/Arbitrary"
import * as Cause from "effect/Cause"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as fc from "effect/FastCheck"
import * as Fiber from "effect/Fiber"
import { flow, identity, pipe } from "effect/Function"
import * as Layer from "effect/Layer"
import * as Logger from "effect/Logger"
import { isObject } from "effect/Predicate"
import * as Schedule from "effect/Schedule"
import * as Schema from "effect/Schema"
import * as Scope from "effect/Scope"
import * as TestEnvironment from "effect/TestContext"
import type * as TestServices from "effect/TestServices"
import * as B from "../bun.js"
import type * as BunTest from "../index.js"

const runPromise = () => <E, A>(effect: Effect.Effect<A, E>) =>
  Effect.gen(function*() {
    const exitFiber = yield* Effect.fork(Effect.exit(effect))

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
const TestEnv = TestEnvironment.TestContext.pipe(
  Layer.provide(Logger.remove(Logger.defaultLogger))
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
      const arbs = arbitraries.map((arbitrary) => Schema.isSchema(arbitrary) ? Arbitrary.make(arbitrary) : arbitrary)
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
								? Arbitrary.make(arbitrary)
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
    const arbs = arbitraries.map((arbitrary) => Schema.isSchema(arbitrary) ? Arbitrary.make(arbitrary) : arbitrary)
    return B.it(
      name,
      // @ts-ignore
      () => fc.assert(fc.property(...arbs, (...as) => self(as)), isObject(timeout) ? timeout?.fastCheck : {}),
      testOptions(timeout)
    )
  }

  const arbs = fc.record(
    Object.keys(arbitraries).reduce(function(result, key) {
      result[key] = Schema.isSchema(arbitraries[key]) ? Arbitrary.make(arbitraries[key]) : arbitraries[key]
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
    ? layer_ as Layer.Layer<R | TestServices.TestServices, E>
    : Layer.provideMerge(layer_, TestEnv)
  const memoMap = options?.memoMap ?? Effect.runSync(Layer.makeMemoMap)
  const scope = Effect.runSync(Scope.make())
  const runtimeEffect = Layer.toRuntimeWithMemoMap(withTestEnv, memoMap).pipe(
    Scope.extend(scope),
    Effect.orDie,
    Effect.cached,
    Effect.runSync
  )

  const makeIt = (it: B.TestAPI): BunTest.BunTest.MethodsNonLive<R, ExcludeTestServices> =>
    Object.assign(it, {
      effect: makeTester<TestServices.TestServices | R>(
        (effect) => Effect.flatMap(runtimeEffect, (runtime) => effect.pipe(Effect.provide(runtime))),
        it
      ),

      prop,

      scoped: makeTester<TestServices.TestServices | Scope.Scope | R>(
        (effect) =>
          Effect.flatMap(runtimeEffect, (runtime) =>
            effect.pipe(
              Effect.scoped,
              Effect.provide(runtime)
            )),
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
    B.beforeAll(() => runPromise()(Effect.asVoid(runtimeEffect)))
    B.afterAll(() => runPromise()(Scope.close(scope, Exit.void)))
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
    effect: makeTester<TestServices.TestServices>(Effect.provide(TestEnv), it),
    scoped: makeTester<TestServices.TestServices | Scope.Scope>(flow(Effect.scoped, Effect.provide(TestEnv)), it),
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
