import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context(viewport={'width': 1280, 'height': 720})
        page = await context.new_page()

        try:
            # Wait for dev server to be ready
            print("Connecting to dev server...")
            await page.goto('http://localhost:4200/hub', timeout=30000)
            await page.wait_for_timeout(3000)
            await page.screenshot(path='v42_hub_final.png')
            print("Captured Hub screenshot")

            await page.goto('http://localhost:4200/studio', timeout=30000)
            await page.wait_for_timeout(3000)
            await page.screenshot(path='v42_studio_final.png')
            print("Captured Studio screenshot")

            await page.goto('http://localhost:4200/piano-roll', timeout=30000)
            await page.wait_for_timeout(3000)
            await page.screenshot(path='v42_piano_roll_final.png')
            print("Captured Piano Roll screenshot")

        except Exception as e:
            print(f"Error during verification: {e}")

        await browser.close()

if __name__ == '__main__':
    asyncio.run(run())
