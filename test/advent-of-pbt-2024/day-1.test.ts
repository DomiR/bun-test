import { expect, it } from '@domir/bun-test';
import { Effect, Schema } from 'effect';
import * as Arbitrary from 'effect/Arbitrary';

class Letter extends Schema.Class<Letter>('Letter')({
	name: Schema.String.pipe(Schema.check(Schema.isMinLength(1), Schema.isPattern(/^[a-z]+$/))),
	age: Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 1, maximum: 77 })))
}) {
	static Array = Schema.Array(this);
}

function sortLetters(letters: Schema.Schema.Type<typeof Letter.Array>) {
	const clonedLetters = [...letters];
	return clonedLetters.sort((la, lb) => la.age - lb.age || la.name.codePointAt(0)! - lb.name.codePointAt(0)!);
}

// `sortLetters` does not order by name when ages are equal, so the property
// check must find (and shrink) a counterexample.
it.effect('day #1: finds the name ordering bug in sortLetters', () =>
	Effect.gen(function* () {
		const result = yield* Arbitrary.checkEffect(
			Arbitrary.schema(Letter.Array),
			(unsortedLetters) => {
				const letters = sortLetters(unsortedLetters);
				for (let i = 1; i < letters.length; ++i) {
					const prev = letters[i - 1];
					const curr = letters[i];
					if (prev.age < curr.age) continue;
					if (prev.age > curr.age || prev.name > curr.name) return false;
				}
				return true;
			},
			{ runs: 10_000, seed: 'advent-of-pbt-2024-day-1' }
		);
		expect(result._tag).toBe('Falsified');
	})
);
