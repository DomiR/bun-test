import * as Data from "effect/Data"
import { expect, test } from "bun:test"

test("Data.struct", () => {
  const alice = Data.struct({ name: "Alice", age: 30 })
  console.log("alice:", JSON.stringify(alice))
  const result = Data.struct({ name: "Alice" })
  console.log("result:", JSON.stringify(result))
  expect(alice).toMatchObject(result)
})
