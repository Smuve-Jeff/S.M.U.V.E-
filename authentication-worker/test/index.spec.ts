import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SignJWT } from 'jose';
import worker from '../src/index';
import type { Env } from '../src/index';

const env: Env = {
	JWT_SECRET: 'test-secret-12345',
	ORIGIN_URL: 'https://origin.example.com',
	ENVIRONMENT: 'test',
	CF_ACCESS_CLIENT_ID: 'test-client-id',
	CF_ACCESS_CLIENT_SECRET: 'test-client-secret',
};

const secret = () => new TextEncoder().encode(env.JWT_SECRET);

/** Signs a gateway token; `withExpiry: false` mints an immortal token. */
const signToken = async (withExpiry = true): Promise<string> => {
	let jwt = new SignJWT({ sub: 'usr_test' })
		.setProtectedHeader({ alg: 'HS256' })
		.setIssuedAt();
	if (withExpiry) jwt = jwt.setExpirationTime('5m');
	return jwt.sign(secret());
};

const call = (path: string, token?: string) => {
	const headers = new Headers();
	if (token !== undefined) headers.set('Authorization', `Bearer ${token}`);
	return worker.fetch(
		new Request(`https://worker.example.com${path}`, { headers }),
		env,
		{} as ExecutionContext
	);
};

describe('authentication gateway worker', () => {
	let forwarded: Request | null = null;

	const stubFetch = (impl: (input: Request) => Promise<Response>) => {
		forwarded = null;
		return vi.stubGlobal(
			'fetch',
			vi.fn(async (input: Request) => {
				forwarded = input;
				return impl(input);
			})
		);
	};

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('answers the health check without a token', async () => {
		const response = await call('/health');
		expect(response.status).toBe(200);
		expect(await response.text()).toBe('OK');
	});

	it('rejects a request without a Bearer token', async () => {
		const response = await call('/api/data');
		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({
			error: 'Missing or invalid Authorization header',
		});
	});

	it('rejects a token signed with the wrong secret as a denial', async () => {
		const wrongSecret = new TextEncoder().encode('not-the-gateway-secret');
		const token = await new SignJWT({ sub: 'usr_test' })
			.setProtectedHeader({ alg: 'HS256' })
			.setExpirationTime('5m')
			.sign(wrongSecret);

		const response = await call('/api/data', token);
		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: 'Invalid or expired token' });
		expect(forwarded).toBeNull(); // never reached the origin
	});

	it('rejects a correctly signed token that never expires', async () => {
		const token = await signToken(false);

		const response = await call('/api/data', token);
		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({
			error: 'Token missing required expiry',
		});
		expect(forwarded).toBeNull();
	});

	it('forwards authenticated requests to the origin with the service credentials', async () => {
		const token = await signToken();
		stubFetch(async () => new Response('forwarded', { status: 200 }));

		const response = await call('/api/data', token);
		expect(response.status).toBe(200);
		expect(await response.text()).toBe('forwarded');

		expect(forwarded).not.toBeNull();
		expect(forwarded!.url).toBe('https://origin.example.com/api/data');
		expect(forwarded!.headers.get('CF-Access-Client-Id')).toBe(
			env.CF_ACCESS_CLIENT_ID
		);
		expect(forwarded!.headers.get('CF-Access-Client-Secret')).toBe(
			env.CF_ACCESS_CLIENT_SECRET
		);
		// The forwarded request carries the CF Access service token, so it
		// must never follow a redirect to somewhere else.
		expect(forwarded!.redirect).toBe('manual');
	});

	it('reports an unreachable origin as an upstream failure, not a denial', async () => {
		// The token is valid — a dead origin must not become a 401 or the
		// artist is told to fix credentials that were never the problem.
		const token = await signToken();
		stubFetch(async () => {
			throw new TypeError('fetch failed');
		});

		const response = await call('/api/data', token);
		expect(response.status).toBe(502);
		expect(await response.json()).toEqual({
			error: 'Upstream service unavailable',
		});
	});

	it('passes origin redirects back to the client untouched', async () => {
		const token = await signToken();
		stubFetch(
			async () =>
				new Response(null, {
					status: 302,
					headers: { location: 'https://evil.example.com/steal' },
				})
		);

		const response = await call('/api/data', token);
		expect(response.status).toBe(302);
		expect(response.headers.get('location')).toBe(
			'https://evil.example.com/steal'
		);
	});
});
