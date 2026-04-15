import asyncio
from playwright.async_api import async_playwright
import base64
import json

async def verify():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context(viewport={'width': 1280, 'height': 800})
        page = await context.new_page()

        # Mock Auth
        user_data = {
            "id": "exec-001",
            "email": "executive@smuve.jeff",
            "emailVerified": True,
            "strategicHealthScore": 92
        }
        salt = "smuve_v2_executive_secure_link"
        auth_data = f"{json.dumps(user_data)}|{salt}"
        auth_value = base64.b64encode(auth_data.encode()).decode()

        await page.goto('http://localhost:4200/login') # Trigger local storage setup if needed, but we inject
        await page.evaluate(f"localStorage.setItem('smuve_auth_session', '{auth_value}')")

        # Navigate to Tha Spot
        await page.goto('http://localhost:4200/tha-spot')
        await page.wait_for_timeout(2000)
        await page.screenshot(path='tha_spot_home.png')
        print("Captured Tha Spot Home")

        # Click Browse All
        await page.click('text=BROWSE ALL')
        await page.wait_for_timeout(1000)
        await page.screenshot(path='tha_spot_browse.png')
        print("Captured Tha Spot Browse")

        # Open Intel
        await page.click('text=INTEL')
        await page.wait_for_timeout(1000)
        await page.screenshot(path='tha_spot_intel.png')
        print("Captured Tha Spot Intel")

        await browser.close()

if __name__ == "__main__":
    # Note: We need a running server for this.
    # Since I cannot run a persistent server and verify in one step easily without backgrounding,
    # I will assume the server setup is handled by the environment or I would run it.
    # However, I will check if I can run the verification.
    print("Verification script ready.")
