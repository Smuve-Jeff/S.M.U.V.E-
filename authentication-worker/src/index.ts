import { jwtVerify } from 'jose';
import { isTokenRevoked, logAuthEvent, type AuthOutcome } from './db';

export interface Env {
	JWT_SECRET: string;
	ORIGIN_URL: string;
	ENVIRONMENT: string;
	CF_ACCESS_CLIENT_ID: string;
	CF_ACCESS_CLIENT_SECRET: string;
	// Cloudflare D1 (SQLite) binding. Optional so `wrangler dev` keeps working
	// before the database has been created and bound.
	DB?: D1Database;
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);

		// 1. Health check - bypass auth
		if (url.pathname === '/health') {
			return new Response('OK', { status: 200 });
		}

		const method = request.method;
		const path = url.pathname;

		const unauthorized = (reason: string, outcome: AuthOutcome = 'deny', userId: string | null = null) => {
			ctx.waitUntil(logAuthEvent(env, { outcome, userId, method, path, reason }));
			return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
				status: 401,
				headers: { 'Content-Type': 'application/json' },
			});
		};

		// 2. Extract Authorization Header
		const authHeader = request.headers.get('Authorization');
		if (!authHeader || !authHeader.startsWith('Bearer ')) {
			return unauthorized('missing-header');
		}

		const token = authHeader.substring(7);

		try {
			// 3. Verify JWT (Client -> Worker)
			const secret = new TextEncoder().encode(env.JWT_SECRET);
			const { payload } = await jwtVerify(token, secret);

			if (env.ENVIRONMENT === 'development') {
				console.log(`Authenticated user: ${payload.sub}`);
			}

			// D1-backed revocation check for tokens that carry a `jti` claim.
			if (env.DB && payload.jti && (await isTokenRevoked(env.DB, String(payload.jti)))) {
				return unauthorized('revoked', 'deny', payload.sub ?? null);
			}

			ctx.waitUntil(logAuthEvent(env, { outcome: 'allow', userId: payload.sub ?? null, method, path, reason: null }));

			// 4. Forward request to the origin (Worker -> Protected Origin)
			const originUrl = new URL(env.ORIGIN_URL);
			url.hostname = originUrl.hostname;
			url.port = originUrl.port;
			url.protocol = originUrl.protocol;

			// Create a new Headers object based on the original request
			const newHeaders = new Headers(request.headers);

			// Attach Cloudflare Access Service Token for origin authentication
			if (env.CF_ACCESS_CLIENT_ID && env.CF_ACCESS_CLIENT_SECRET) {
				newHeaders.set('CF-Access-Client-Id', env.CF_ACCESS_CLIENT_ID);
				newHeaders.set('CF-Access-Client-Secret', env.CF_ACCESS_CLIENT_SECRET);
			}

			const modifiedRequest = new Request(url.toString(), {
				method: request.method,
				headers: newHeaders,
				body: request.body,
				redirect: 'follow',
			});

			return await fetch(modifiedRequest);
		} catch (e) {
			console.error(`Auth failure: ${e instanceof Error ? e.message : String(e)}`);
			return unauthorized('verify-failed', 'invalid');
		}
	},
};
