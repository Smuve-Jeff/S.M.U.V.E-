import { defineConfig } from 'vitest/config';

// Plain Node runner rather than @cloudflare/vitest-pool-workers: workerd ships
// no Android/arm64 binary (this repo's development host), so a workers-pool
// suite can never execute here. The worker's fetch handler is pure
// Request/Response/fetch plumbing, which Node provides natively.
export default defineConfig({
	test: {
		environment: 'node',
		include: ['test/**/*.spec.ts'],
	},
});
