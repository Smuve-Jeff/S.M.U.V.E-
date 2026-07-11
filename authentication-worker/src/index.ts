import { jwtVerify } from 'jose';

export interface Env {
  JWT_SECRET: string;
  ORIGIN_URL: string;
  ENVIRONMENT: string;
  CF_ACCESS_CLIENT_ID: string;
  CF_ACCESS_CLIENT_SECRET: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // 1. Health check - bypass auth
    if (url.pathname === "/health") {
      return new Response("OK", { status: 200 });
    }

    // 2. Extract Authorization Header
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing or invalid Authorization header" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const token = authHeader.substring(7);

    try {
      // 3. Verify JWT (Client -> Worker)
      const secret = new TextEncoder().encode(env.JWT_SECRET);
      const { payload } = await jwtVerify(token, secret);

      if (env.ENVIRONMENT === "development") {
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
        newHeaders.set("CF-Access-Client-Id", env.CF_ACCESS_CLIENT_ID);
        newHeaders.set("CF-Access-Client-Secret", env.CF_ACCESS_CLIENT_SECRET);
      }

      const modifiedRequest = new Request(url.toString(), {
        method: request.method,
        headers: newHeaders,
        body: request.body,
        redirect: "follow",
      });

      return await fetch(modifiedRequest);

    } catch (e) {
      console.error(`Auth failure: ${e instanceof Error ? e.message : String(e)}`);
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};
