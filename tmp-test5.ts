import { test, it } from "bun:test"

// Test if Bun supports fails:true
it("test with fails: true option", () => {
  throw new Error("expected failure")
}, { fails: true } as any)

it("test with fails:true that passes", () => {
  // no error
}, { fails: true } as any)
