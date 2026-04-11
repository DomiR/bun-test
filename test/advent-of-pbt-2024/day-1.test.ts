import { it } from "@domir/bun-test"
import { Schema } from "effect"

class Letter extends Schema.Class<Letter>("Letter")({
  name: Schema.String.check(
    Schema.isMinLength(1),
    Schema.isPattern(/^[a-z]+$/)
  ),
  age: Schema.Int.check(
    Schema.isBetween({ minimum: 1, maximum: 77 })
  )
}) {
  static Array = Schema.Array(this)
}

function sortLetters(letters: Schema.Schema.Type<typeof Letter.Array>) {
  const clonedLetters = [...letters]
  return clonedLetters.sort((la, lb) => la.age - lb.age || la.name.codePointAt(0)! - lb.name.codePointAt(0)!)
}

it.prop(
  "day #1: should properly sort letters",
  [Letter.Array],
  ([unsortedLetters]) => {
    const letters = sortLetters(unsortedLetters)
    for (let i = 1; i < letters.length; ++i) {
      const prev = letters[i - 1]
      const curr = letters[i]
      if (prev.age < curr.age) continue // properly ordered
      if (prev.age > curr.age) throw new Error("Invalid on age")
      if (prev.name > curr.name) throw new Error("Invalid on name")
    }
  },
  { fails: true, fastCheck: { seed: 1485455336, path: "352:3:7:9:9:13:12:11", endOnFailure: true } }
)
