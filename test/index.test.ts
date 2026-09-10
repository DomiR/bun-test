import { afterAll, describe, expect, it, layer } from "@domir/bun-test"
import { Context, Duration, Effect, Fiber, Layer, Schema } from "effect"
import { FastCheck, TestClock } from "effect/testing"

it.effect(
  "effect",
  () => Effect.acquireRelease(Effect.sync(() => expect(1).toEqual(1)), () => Effect.void)
)
it.live(
  "live",
  () => Effect.acquireRelease(Effect.sync(() => expect(1).toEqual(1)), () => Effect.void)
)

// each

it.effect.each([1, 2, 3])(
  "effect each %s",
  (n) => Effect.acquireRelease(Effect.sync(() => expect(n).toEqual(n)), () => Effect.void)
)
it.live.each([1, 2, 3])(
  "live each %s",
  (n) => Effect.acquireRelease(Effect.sync(() => expect(n).toEqual(n)), () => Effect.void)
)
// bun's `it.each` spreads array cases; the wrapper must still pass them whole
it.effect.each([[1, 2], [3, 4]])(
  "effect each with array case %p",
  ([a, b]) => Effect.sync(() => expect(a + 1).toEqual(b))
)
it.live.each([[1, 2], [3, 4]])(
  "live each with array case %p",
  ([a, b]) => Effect.sync(() => expect(a + 1).toEqual(b))
)

// skip

it.live.skip(
  "live skipped",
  () => Effect.die("skipped anyway")
)
it.effect.skip(
  "effect skipped",
  () => Effect.die("skipped anyway")
)

// skipIf

it.effect.skipIf(true)("effect skipIf (true)", () => Effect.die("skipped anyway"))
it.effect.skipIf(false)("effect skipIf (false)", () => Effect.sync(() => expect(1).toEqual(1)))

// runIf

it.effect.runIf(true)("effect runIf (true)", () => Effect.sync(() => expect(1).toEqual(1)))
it.effect.runIf(false)("effect runIf (false)", () => Effect.die("not run anyway"))

// This simulates a runner-timeout interrupting a running effect, so it can be
// re-enabled if bun ever supports it. bun's test function receives no
// `AbortSignal`, only an optional `done` callback (see bun-types' `Test`
// interface), so `@domir/bun-test` has no way to hand a signal to
// `Effect.runPromise` and interrupt the fiber when bun's own per-test timeout
// fires: the effect below just keeps sleeping past the 1ms timeout instead of
// being interrupted. Separately, and less importantly, bun 1.3.14's
// `test.failing` only flips a thrown error, not a runner timeout, so this
// couldn't pass as `it.live.fails` either way. The rstest/vitest ports keep
// the equivalent test enabled because their runners hand `Effect.runPromise`
// a real signal.
it.live.skip("interrupts on timeout", () =>
  Effect.gen(function*() {
    let acquired = false

    yield* Effect.acquireRelease(
      Effect.sync(() => acquired = true),
      () => Effect.sync(() => acquired = false)
    )
    yield* Effect.sleep(1000)
  }), 1)

class Foo extends Context.Service<Foo, "foo">()("Foo") {
  static Live = Layer.succeed(Foo, "foo")
}

class Bar extends Context.Service<Bar, "bar">()("Bar") {
  static Live = Layer.effect(Bar, Effect.map(Effect.service(Foo), () => "bar" as const))
}

class Sleeper extends Context.Service<Sleeper, {
  sleep: (ms: number) => Effect.Effect<void>
}>()("Sleeper") {
  static Default = Layer.effect(
    Sleeper,
    Effect.clockWith((clock) =>
      Effect.succeed({
        sleep: (ms: number) => clock.sleep(Duration.millis(ms))
      } as const)
    )
  )
}

const realNumber = FastCheck.float({ noNaN: true, noDefaultInfinity: true })

describe("layer", () => {
  layer(Foo.Live)((it) => {
    it.effect("adds context", () =>
      Effect.gen(function*() {
        const foo = yield* Foo
        expect(foo).toEqual("foo")
      }))

    it.layer(Bar.Live)("nested", (it) => {
      it.effect("adds context", () =>
        Effect.gen(function*() {
          const foo = yield* Foo
          const bar = yield* Bar
          expect(foo).toEqual("foo")
          expect(bar).toEqual("bar")
        }))
    })

    it.layer(Bar.Live)((it) => {
      it.effect("without name", () =>
        Effect.gen(function*() {
          const foo = yield* Foo
          const bar = yield* Bar
          expect(foo).toEqual("foo")
          expect(bar).toEqual("bar")
        }))
    })

    describe("release", () => {
      let released = false
      afterAll(() => {
        expect(released).toEqual(true)
      })

      class Scoped extends Context.Service<Scoped, "scoped">()("Scoped") {
        static Live = Layer.effect(
          Scoped,
          Effect.acquireRelease(
            Effect.succeed("scoped" as const),
            () => {
              return Effect.sync(() => released = true)
            }
          )
        )
      }

      it.layer(Scoped.Live)((it) => {
        it.effect("adds context", () =>
          Effect.gen(function*() {
            const foo = yield* Foo
            const scoped = yield* Scoped
            expect(foo).toEqual("foo")
            expect(scoped).toEqual("scoped")
          }))
      })

      it.effect.prop(
        "adds context",
        [realNumber],
        ([num]) =>
          Effect.gen(function*() {
            const foo = yield* Foo
            expect(foo).toEqual("foo")
            return num === num
          }),
        { fastCheck: { numRuns: 200 } }
      )
    })
  })

  layer(Sleeper.Default)("test services", (it) => {
    it.effect("TestClock", () =>
      Effect.gen(function*() {
        const sleeper = yield* Sleeper
        const fiber = yield* Effect.forkChild(sleeper.sleep(100_000))
        yield* Effect.yieldNow
        yield* TestClock.adjust(100_000)
        yield* Fiber.join(fiber)
      }))
  })

  layer(Foo.Live)("with a name", (it) => {
    describe("with a nested describe", () => {
      it.effect("adds context", () =>
        Effect.gen(function*() {
          const foo = yield* Foo
          expect(foo).toEqual("foo")
        }))
    })
    it.effect("adds context", () =>
      Effect.gen(function*() {
        const foo = yield* Foo
        expect(foo).toEqual("foo")
      }))
  })

  layer(Sleeper.Default, { excludeTestServices: true })("live services", (it) => {
    it.effect("Clock", () =>
      Effect.gen(function*() {
        const sleeper = yield* Sleeper
        yield* sleeper.sleep(1)
      }))
  })
})

// // property testing

it.prop("symmetry", [realNumber, FastCheck.integer()], ([a, b]) => a + b === b + a)

it.prop(
  "symmetry with object",
  { a: realNumber, b: FastCheck.integer() },
  ({ a, b }) => a + b === b + a
)

it.effect.prop("symmetry", [realNumber, FastCheck.integer()], ([a, b]) =>
  Effect.gen(function*() {
    yield* Effect.void

    return a + b === b + a
  }))

it.effect.prop("symmetry with object", { a: realNumber, b: FastCheck.integer() }, ({ a, b }) =>
  Effect.gen(function*() {
    yield* Effect.void

    return a + b === b + a
  }))

it.effect.prop(
  "should detect the substring",
  { a: Schema.String, b: Schema.String, c: FastCheck.string() },
  ({ a, b, c }) =>
    Effect.gen(function*() {
      yield* Effect.scope
      return (a + b + c).includes(b)
    })
)
