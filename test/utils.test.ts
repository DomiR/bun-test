import { describe, expect, it } from '@domir/bun-test';
import { fail, strictEqual, throws, throwsAsync } from '@domir/bun-test/utils';

describe('throws', () => {
	it('passes when the thunk throws', () => {
		throws(() => {
			throw new Error('boom');
		});
	});

	it('compares the thrown value against the expected error', () => {
		throws(() => {
			throw new Error('boom');
		}, new Error('boom'));
	});

	it('runs the predicate against the thrown value', () => {
		throws(
			() => {
				throw new Error('boom');
			},
			(e) => {
				strictEqual((e as Error).message, 'boom');
				return undefined;
			}
		);
	});

	it('fails when the thunk does not throw', () => {
		expect(() => throws(() => {})).toThrow('Expected to throw an error');
	});

	it('fails when the thunk does not throw even with an expected error', () => {
		expect(() => throws(() => {}, new Error('boom'))).toThrow('Expected to throw an error');
	});

	it('fails when the thrown value does not match the expected error', () => {
		expect(() =>
			throws(() => {
				throw new Error('boom');
			}, new Error('other'))
		).toThrow();
	});
});

describe('throwsAsync', () => {
	it('passes when the thunk rejects', async () => {
		await throwsAsync(async () => {
			throw new Error('boom');
		});
	});

	it('compares the rejection against the expected error', async () => {
		await throwsAsync(async () => {
			throw new Error('boom');
		}, new Error('boom'));
	});

	it('fails when the thunk does not reject', async () => {
		await expect(throwsAsync(async () => {})).rejects.toThrow('Expected to throw an error');
	});

	it('fails when the thunk does not reject even with an expected error', async () => {
		await expect(throwsAsync(async () => {}, new Error('boom'))).rejects.toThrow('Expected to throw an error');
	});
});

describe('fail', () => {
	it('throws an AssertionError carrying the message', () => {
		expect(() => fail('nope')).toThrow('nope');
	});
});
