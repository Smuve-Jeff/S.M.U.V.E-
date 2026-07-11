import { jwtVerify, SignJWT } from 'jose';

async function runTests() {
  console.log("🚀 Starting Authentication Worker Tests...\n");

  const SECRET = "test-secret-12345";
  const secretKey = new TextEncoder().encode(SECRET);
  const ORIGIN_URL = "https://example.com";
  
  // Mock environment
  const env = {
    JWT_SECRET: SECRET,
    ORIGIN_URL: ORIGIN_URL,
    ENVIRONMENT: "development"
  };

  // Mock Request helper
  const createMockRequest = (token = null) => {
    const headers = new Headers();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return new Request("https://worker.example.com/api/data", {
      headers: headers
    });
  };

  // Import the worker logic
  // Since we are in a node environment for the test script, we'll simulate the fetch handler
  const { default: worker } = await import('../src/index.ts'); 
  // Note: In a real scenario, we'd use a test runner or Miniflare. 
  // Because this is a script, we are simulating the worker's behavior.

  async function testCase(name, token, expectedStatus) {
    console.log(`Testing: ${name}...`);
    const request = createMockRequest(token);
    
    try {
      // Simulate the worker's fetch call
      // Note: We have to mock the global 'fetch' for the proxy part
      const originalFetch = global.fetch;
      global.fetch = async (req) => {
        return new Response("Origin Success", { status: 200 });
      };

      const response = await worker.fetch(request, env, {});
      const status = response.status;
      
      if (status === expectedStatus) {
        console.log(`✅ PASS (Status: ${status})`);
      } else {
        console.log(`❌ FAIL: Expected ${expectedStatus}, got ${status}`);
      }
      
      global.fetch = originalFetch;
    } catch (e) {
      console.log(`❌ ERROR: ${e.message}`);
    }
    console.log("-----------------------------------");
  }

  // 1. Test No Token
  await testCase("No Authorization Header", null, 401);

  // 2. Test Invalid Token
  await testCase("Invalid Token", "not-a-real-token", 401);

  // 3. Test Valid Token
  const validToken = await new SignJWT({ sub: "user123" })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(secretKey);
  
  await testCase("Valid JWT Token", validToken, 200);

  // 4. Test Expired Token
  const expiredToken = await new SignJWT({ sub: "user123" })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('-1h') // Expired 1 hour ago
    .sign(secretKey);
    
  await testCase("Expired JWT Token", expiredToken, 401);

  console.log("\n✨ Tests Completed.");
}

runTests().catch(console.error);
