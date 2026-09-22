import { jwtVerify, type JWTPayload } from 'jose';

export interface Env {
	JWT_SECRET: string;
	ORIGIN_URL: string;
	ENVIRONMENT: string;
	CF_ACCESS_CLIENT_ID: string;
	CF_ACCESS_CLIENT_SECRET: string;
}

const json = (
	body: unknown,
	status: number,
	headers: Record<string, string> = {}
): Response =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json', ...headers },
	});

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);

		// 1. Health check - bypass auth
		if (url.pathname === '/health') {
			return new Response('OK', { status: 200 });
		}

		// 2. Extract Authorization Header
		const authHeader = request.headers.get('Authorization');
		if (!authHeader || !authHeader.startsWith('Bearer ')) {
			return json({ error: 'Missing or invalid Authorization header' }, 401);
		}

		const token = authHeader.substring(7);

		// 3. Verify JWT (Client -> Worker). Credential failures and upstream
		//    failures are different problems with different fixes — a dead
		//    origin must never masquerade as a denial (and vice versa), so
		//    verification and forwarding get their own error handling.
		let payload: JWTPayload;
		try {
			const secret = new TextEncoder().encode(env.JWT_SECRET);
			({ payload } = await jwtVerify(token, secret));
		} catch (e) {
			console.error(`Auth failure: ${e instanceof Error ? e.message : String(e)}`);
			return json({ error: 'Invalid or expired token' }, 401, {
				'WWW-Authenticate': 'Bearer',
			});
		}

		// A token without an expiry never stops working. Require one.
		if (typeof payload.exp !== 'number') {
			return json({ error: 'Token missing required expiry' }, 401, {
				'WWW-Authenticate': 'Bearer error="invalid_token"',
			});
		}

		if (env.ENVIRONMENT === 'development') {
			console.log(`Authenticated user: ${payload.sub}`);
		}

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
			// Never follow redirects: this request carries the CF Access
			// service token, and following would hand it to whatever the
			// origin points at. Pass the 3xx back to the client instead.
			redirect: 'manual',
		});

		try {
			return await fetch(modifiedRequest);
		} catch (e) {
			// The token was good; the origin is the problem.
			console.error(`Origin failure: ${e instanceof Error ? e.message : String(e)}`);
			return json({ error: 'Upstream service unavailable' }, 502);
		}
	},
};
