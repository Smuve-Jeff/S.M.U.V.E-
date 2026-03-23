import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_context(viewport={'width': 1280, 'height': 720}).new_page()

        # Navigate to the app (assuming it's running on port 4200)
        try:
            await page.goto('http://localhost:4200/hub', timeout=10000)
            await page.wait_for_timeout(2000)
            await page.screenshot(path='hub_changes.png')
            print("Captured Hub screenshot")

            await page.goto('http://localhost:4200/studio', timeout=10000)
            await page.wait_for_timeout(2000)
            await page.screenshot(path='studio_turntables.png')
            print("Captured Studio screenshot")

            # Navigate to Piano Roll
            await page.goto('http://localhost:4200/piano-roll', timeout=10000)
            await page.wait_for_timeout(2000)
            await page.screenshot(path='piano_roll_changes.png')
            print("Captured Piano Roll screenshot")

        except Exception as e:
            print(f"Could not connect to dev server: {e}")

        await browser.close()

if __name__ == '__main__':
    asyncio.run(run())
