/**
 * @since 4.0.0
 */
import * as B from 'bun:test';

/**
 * @since 4.0.0
 */
export interface TestAPI extends B.Test<[]> {}

/**
 * @since 4.0.0
 */
export type TestOptions = B.TestOptions;

/**
 * @since 4.0.0
 */
export type TestFunction = (
	label: string,
	fn: (() => void | Promise<unknown>) | ((done: (err?: unknown) => void) => void),
	options?: number | TestOptions
) => void;

/**
 * @since 4.0.0
 */
export type SuiteCollector = any;

/**
 * @since 4.0.0
 */
export const it: TestAPI = B.it as unknown as TestAPI;

/**
 * @since 4.0.0
 */
export const describe = B.describe;

/**
 * @since 4.0.0
 */
export const beforeAll = B.beforeAll;

/**
 * @since 4.0.0
 */
export const afterAll = B.afterAll;

/**
 * @since 4.0.0
 */
export const beforeEach = B.beforeEach;

/**
 * @since 4.0.0
 */
export const afterEach = B.afterEach;

/**
 * @since 4.0.0
 */
export const expect = B.expect;
