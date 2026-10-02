/**
 * @since 4.0.0
 */

import * as Cause from 'effect/Cause';
import * as Duration from 'effect/Duration';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import { flow, pipe } from 'effect/Function';
import * as Layer from 'effect/Layer';
import * as Schedule from 'effect/Schedule';
import type * as Schema from 'effect/Schema';
import * as Scope from 'effect/Scope';
import * as TestClock from 'effect/testing/TestClock';
import * as TestConsole from 'effect/testing/TestConsole';
import * as Arbitrary from 'effect/Arbitrary';
import * as B from '../bun.js';
import type * as BunTest from '../index.js';

const runPromise: <E, A>(_: Effect.Effect<A, E, never>) => Promise<A> = Effect.fnUntraced(
	function* <E, A>(effect: Effect.Effect<A, E>) {
		const exit = yield* Effect.exit(effect);
		if (Exit.isFailure(exit)) {
			const errors = Cause.prettyErrors(exit.cause);
			for (let i = 0; i < errors.length; i++) {
				yield* Effect.logError(errors[i]);
			}
		}
		return yield* exit;
	},
	(effect) => Effect.runPromise(effect)
);

/** @internal */
const runTest = <E, A>(effect: Effect.Effect<A, E>) => runPromise(effect);

const TestEnv = Layer.mergeAll(TestConsole.layer, TestClock.layer());

/** @internal */
export const addEqualityTesters = () => {
	// bun:test has no addEqualityTesters; kept as a no-op for API parity.
};

/** @internal */
const testOptions = (timeout?: number | B.TestOptions) => (typeof timeout === 'number' ? { timeout } : (timeout ?? {}));

const hookTimeout = (timeout?: Duration.Input) =>
	timeout === undefined ? undefined : Duration.toMillis(Duration.fromInputUnsafe(timeout));

type PropertyTimeout =
	| number
	| (B.TestOptions & {
			readonly arbitrary?: Arbitrary.CheckOptions | undefined;
	  });

type ArbitraryInput = Schema.Schema<any> | Arbitrary.Arbitrary<unknown>;

type Arbitraries = Array<ArbitraryInput> | { [K in string]: ArbitraryInput };

const propertyTestOptions = (timeout: PropertyTimeout | undefined): Exclude<PropertyTimeout, number> | undefined =>
	typeof timeout === 'number' ? undefined : timeout;

const checkOptions = (timeout: PropertyTimeout | undefined): Arbitrary.CheckOptions | undefined =>
	propertyTestOptions(timeout)?.arbitrary;

const compileArbitraryInput = (input: ArbitraryInput): Arbitrary.Arbitrary<any> =>
	Arbitrary.isArbitrary(input) ? input : Arbitrary.schema(input);

const makeArbitrary = (arbitraries: Arbitraries): Arbitrary.Arbitrary<any> =>
	Arbitrary.all(
		Array.isArray(arbitraries)
			? arbitraries.map(compileArbitraryInput)
			: Object.fromEntries(Object.entries(arbitraries).map(([key, input]) => [key, compileArbitraryInput(input)]))
	);

const normalizeProperty = <A, E, R>(
	property: (value: A) => boolean | Effect.Effect<boolean, E, R>,
	value: A
): Effect.Effect<boolean, E | Cause.Cause<E>, R> =>
	Effect.catchCause(
		Effect.suspend(() => {
			const output = property(value);
			return Effect.isEffect(output) ? output : Effect.succeed(output);
		}),
		(cause): Effect.Effect<never, E | Cause.Cause<E>> =>
			Cause.hasInterrupts(cause) ? Effect.failCause(cause) : Effect.fail(cause)
	);

const runCheck = <A, E>(
	arbitrary: Arbitrary.Arbitrary<A>,
	property: (value: A) => boolean | Effect.Effect<boolean, E>,
	options: Arbitrary.CheckOptions | undefined
): Promise<void> =>
	runTest(
		Effect.flatMapEager(
			Arbitrary.checkEffect(arbitrary, (value) => normalizeProperty(property, value), options),
			(result) => {
				const failure = Arbitrary.formatCheckFailure(result);
				return failure === undefined ? Effect.void : Effect.die(new Error(failure));
			}
		)
	);

const makeItProxy = <Methods extends object>(it: B.TestAPI, overrides: Methods): Methods & B.TestAPI =>
	new Proxy(it as Methods & B.TestAPI, {
		apply(target, thisArg, argArray) {
			return Reflect.apply(target as any, thisArg, argArray);
		},
		get(target, property, _receiver) {
			if (Object.hasOwn(overrides, property)) {
				return Reflect.get(overrides, property);
			}
			// Forward with `target` (not the proxy) as the receiver: bun:test's
			// `it.failing` etc. are getters that branch on `this`, and they reject
			// the proxy because it isn't an instance of bun's internal class.
			const value = Reflect.get(target, property, target);
			return typeof value === 'function' ? value.bind(target) : value;
		}
	});

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
			runTest
		);

	const f: BunTest.BunTest.Test<R> = (name, self, timeout) => it(name, () => run([], self), testOptions(timeout));

	const skip: BunTest.BunTest.Tester<R>['skip'] = (name, self, timeout) =>
		it.skip(name, () => run([], self), testOptions(timeout));

	const skipIf: BunTest.BunTest.Tester<R>['skipIf'] = (condition) => (name, self, timeout) =>
		it.skipIf(Boolean(condition))(name, () => run([], self), testOptions(timeout));

	const runIf: BunTest.BunTest.Tester<R>['runIf'] = (condition) => (name, self, timeout) =>
		it.if(Boolean(condition))(name, () => run([], self), testOptions(timeout));

	const only: BunTest.BunTest.Tester<R>['only'] = (name, self, timeout) =>
		it.only(name, () => run([], self), testOptions(timeout));

	// vitest's `it.for` hands each case to the test function whole, while bun's
	// `it.each` spreads array cases into positional arguments. Wrap every case in
	// a single-element row so bun's spreading yields the whole case again.
	const each: BunTest.BunTest.Tester<R>['each'] = (cases) => (name, self, timeout) =>
		it.each(cases.map((c) => [c]) as any)(name, (args: any) => run([args], self) as any, testOptions(timeout));

	const fails: BunTest.BunTest.Tester<R>['fails'] = (name, self, timeout) =>
		it.failing(name, () => run([], self), testOptions(timeout));

	const prop: BunTest.BunTest.Tester<R>['prop'] = (name, arbitraries, self, timeout) => {
		const arbitrary = makeArbitrary(arbitraries);
		return it(
			name,
			() =>
				runCheck(
					arbitrary,
					(values) =>
						Effect.mapEager(
							mapEffect(Effect.suspend(() => self(values as any))),
							(value) => (value as unknown) !== false
						),
					checkOptions(timeout)
				),
			testOptions(timeout)
		);
	};

	return Object.assign(f, { skip, skipIf, runIf, only, each, fails, prop });
};

/** @internal */
export const prop: BunTest.BunTest.Methods['prop'] = (name, arbitraries, self, timeout) => {
	const arbitrary = makeArbitrary(arbitraries);
	return B.it(
		name,
		() => runCheck(arbitrary, (values) => (self(values as any) as unknown) !== false, checkOptions(timeout)),
		testOptions(timeout)
	);
};

/** @internal */
export const layer =
	<R, E>(
		layer_: Layer.Layer<R, E>,
		options?: {
			readonly memoMap?: Layer.MemoMap;
			readonly timeout?: Duration.Input;
			readonly excludeTestServices?: boolean;
		}
	): {
		(f: (it: BunTest.BunTest.MethodsNonLive<R>) => void): void;
		(name: string, f: (it: BunTest.BunTest.MethodsNonLive<R>) => void): void;
	} =>
	(
		...args:
			| [name: string, f: (it: BunTest.BunTest.MethodsNonLive<R>) => void]
			| [f: (it: BunTest.BunTest.MethodsNonLive<R>) => void]
	) => {
		const excludeTestServices = options?.excludeTestServices ?? false;
		const withTestEnv = excludeTestServices ? (layer_ as Layer.Layer<R, E>) : Layer.provideMerge(layer_, TestEnv);
		const memoMap = options?.memoMap ?? Effect.runSync(Layer.makeMemoMap);
		const scope = Effect.runSync(Scope.make());
		const contextEffect = Layer.buildWithMemoMap(withTestEnv, memoMap, scope).pipe(
			Effect.orDie,
			Effect.cached,
			Effect.runSync
		);
		let closed = false;
		const closeScope = () => {
			if (closed) {
				return Promise.resolve();
			}
			closed = true;
			return runPromise(Scope.close(scope, Exit.void));
		};

		const makeIt = (it: B.TestAPI): BunTest.BunTest.MethodsNonLive<R> =>
			makeItProxy(it, {
				effect: makeTester<R | Scope.Scope>(
					(effect) => Effect.flatMap(contextEffect, (context) => effect.pipe(Effect.scoped, Effect.provide(context))),
					it
				),
				prop,
				flakyTest,
				layer<R2, E2>(
					nestedLayer: Layer.Layer<R2, E2, R>,
					options?: {
						readonly timeout?: Duration.Input;
					}
				) {
					return layer(Layer.provideMerge(nestedLayer, withTestEnv), {
						...options,
						memoMap: Layer.forkMemoMapUnsafe(memoMap),
						excludeTestServices
					});
				}
			});

		// Bun's beforeAll/afterAll need to be called in a describe block to reliably
		// run before and after all tests. When no label is provided, we still wrap in
		// an empty describe so the lifecycle hooks behave as expected.
		const label = args.length === 1 ? '' : args[0];

		return B.describe(label, () => {
			B.beforeAll(() => runPromise(Effect.asVoid(contextEffect)), hookTimeout(options?.timeout));
			B.afterAll(() => closeScope(), hookTimeout(options?.timeout));
			return (args.length === 1 ? args[0] : args[1])(makeIt(B.it));
		});
	};

/** @internal */
export const flakyTest = <A, E, R>(
	self: Effect.Effect<A, E, R | Scope.Scope>,
	timeout: Duration.Input = Duration.seconds(30)
) =>
	pipe(
		self,
		Effect.scoped,
		Effect.sandbox,
		Effect.retry(
			pipe(
				Schedule.recurs(10),
				Schedule.while((_) =>
					Effect.succeed(
						Duration.isLessThanOrEqualTo(Duration.fromInputUnsafe(_.elapsed), Duration.fromInputUnsafe(timeout))
					)
				)
			)
		),
		Effect.orDie
	);

/** @internal */
export const makeMethods = (it: B.TestAPI): BunTest.BunTest.Methods =>
	makeItProxy(it, {
		effect: makeTester<Scope.Scope>(flow(Effect.scoped, Effect.provide(TestEnv)), it),
		live: makeTester<Scope.Scope>(Effect.scoped, it),
		flakyTest,
		layer,
		prop
	});

/** @internal */
export const {
	/** @internal */
	effect,
	/** @internal */
	live
} = makeMethods(B.it);

/** @internal */
export const describeWrapped = (name: string, f: (it: BunTest.BunTest.Methods) => void): B.SuiteCollector =>
	B.describe(name, () => f(makeMethods(B.it)));
