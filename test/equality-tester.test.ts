import { describe, expect, it } from "@domir/bun-test"
import * as Cause from "effect/Cause"
import * as Data from "effect/Data"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import * as Result from "effect/Result"

describe("toMatchObject", () => {
  it("plain objects", () => {
    expect({ a: 1, b: 2 }).toMatchObject({ a: 1 })
  })

  it("Data.struct", () => {
    const alice = Data.struct({ name: "Alice", age: 30 })

    expect(alice).toMatchObject(Data.struct({ name: "Alice" }))
  })

  it("option", () => {
    expect(Option.some({ a: 1, b: 2 })).toMatchObject(Option.some({ a: 1 }))
    expect(Option.none()).toMatchObject(Option.none())
    expect({ x: Option.some({ a: 1, b: 2 }), y: Option.none() }).toMatchObject({ x: Option.some({ a: 1 }) })

    expect(Option.none()).not.toMatchObject(Option.some({ a: 1 }))
    expect(Option.some({ b: 1 })).not.toMatchObject(Option.some({ a: 1 }))
    expect({ x: Option.some({ a: 1, b: 2 }), y: Option.none() }).not.toMatchObject({ x: Option.some({ b: 1 }) })
    expect({ x: Option.none(), y: Option.none() }).not.toMatchObject({ x: Option.some({}) })
  })

  it("result", () => {
    expect(Result.succeed({ a: 1, b: 2 })).toMatchObject(Result.succeed({ a: 1 }))
    expect(Result.fail({ a: 1, b: 2 })).toMatchObject(Result.fail({ a: 1 }))

    expect(Result.succeed({ a: 1, b: 2 })).not.toMatchObject(Result.fail({ a: 1 }))
    expect(Result.fail({ a: 1, b: 2 })).not.toMatchObject(Result.succeed({ a: 1 }))
  })

  it("result", () => {
    expect(Result.succeed({ a: 1, b: 2 })).toMatchObject(Result.succeed({ a: 1 }))
    expect(Result.fail({ a: 1, b: 2 })).toMatchObject(Result.fail({ a: 1 }))

    expect(Result.succeed({ a: 1, b: 2 })).not.toMatchObject(Result.fail({ a: 1 }))
    expect(Result.fail({ a: 1, b: 2 })).not.toMatchObject(Result.succeed({ a: 1 }))
  })
})

describe.each(["toStrictEqual", "toEqual"] as const)("%s", (matcher) => {
  it("result", () => {
    expect(Result.succeed(1))[matcher](Result.succeed(1))
    expect(Result.fail(1))[matcher](Result.fail(1))

    expect(Result.succeed(2)).not[matcher](Result.succeed(1))
    expect(Result.fail(2)).not[matcher](Result.fail(1))
    expect(Result.fail(1)).not[matcher](Result.succeed(1))
    expect(Result.fail(1)).not[matcher](Result.succeed(2))
  })

  it("exit", () => {
    expect(Exit.succeed(1))[matcher](Exit.succeed(1))
    expect(Exit.fail("failure"))[matcher](Exit.fail("failure"))
    expect(Exit.die("defect"))[matcher](Exit.die("defect"))

    expect(Exit.succeed(1)).not[matcher](Exit.succeed(2))
    expect(Exit.fail("failure")).not[matcher](Exit.fail("failure1"))
    expect(Exit.die("failure")).not[matcher](Exit.fail("failure1"))
    expect(Exit.die("failure")).not[matcher](Exit.fail("failure1"))
    expect(Exit.failCause(Cause.sequential(Cause.fail("f1"), Cause.fail("f2")))).not[matcher](
      Exit.failCause(Cause.sequential(Cause.fail("f1"), Cause.fail("f3")))
    )
  })

  it("option", () => {
    expect(Option.some(2))[matcher](Option.some(2))
    expect(Option.none())[matcher](Option.none())

    expect(Option.some(2)).not[matcher](Option.some(1))
    expect(Option.none()).not[matcher](Option.some(1))
  })
})
