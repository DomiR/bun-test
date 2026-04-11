import { Context, Effect, Layer } from "effect"
import * as ManagedRuntime from "effect/ManagedRuntime"

class Foo extends Context.Service<Foo, "foo">()("Foo") {
  static Live = Layer.succeed(Foo, "foo")
}

class Bar extends Context.Service<Bar, "bar">()("Bar") {
  static Live = Layer.effect(Bar, Effect.map(Foo, () => "bar" as const))
}

// Direct provide
const combinedLayer = Bar.Live.pipe(Layer.provide(Foo.Live))

const mr = ManagedRuntime.make(combinedLayer.pipe(Layer.orDie))
const ctx = await mr.context()
console.log("context keys:", [...ctx.mapUnsafe.keys()])

const result = await Effect.gen(function*() {
  const bar = yield* Bar
  console.log("bar:", bar)
}).pipe(
  Effect.provide(ctx),
  Effect.runPromise
)
console.log("Done!")
