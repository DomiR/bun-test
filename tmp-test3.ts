import { Context, Effect, Layer } from "effect"
import * as ManagedRuntime from "effect/ManagedRuntime"

class Foo extends Context.Service<Foo, "foo">()("Foo") {
  static Live = Layer.succeed(Foo, "foo")
}

class Bar extends Context.Service<Bar, "bar">()("Bar") {
  static Live = Layer.effect(Bar, Effect.map(Foo, () => "bar" as const))
}

// Use mergeAll instead
const combinedLayer = Layer.mergeAll(Bar.Live.pipe(Layer.provide(Foo.Live)), Foo.Live)

const mr = ManagedRuntime.make(combinedLayer.pipe(Layer.orDie))
const ctx = await mr.context()

const result = await Effect.gen(function*() {
  const foo = yield* Foo
  const bar = yield* Bar
  console.log("foo:", foo)
  console.log("bar:", bar)
}).pipe(
  Effect.provide(ctx),
  Effect.runPromise
)

await mr.dispose()
console.log("Done!")
