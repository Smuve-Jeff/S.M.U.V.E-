import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        # Test loading the app
        await page.goto("http://localhost:4200")
        await page.wait_for_timeout(3000)

        # Take a screenshot of the Hub (initial view)
        await page.screenshot(path="hub_initial.png")
        print("Initial Hub view captured.")

        # Try to navigate to settings
        # Use direct URL navigation to be sure
        await page.goto("http://localhost:4200/settings")
        await page.wait_for_timeout(3000)

        # Verify settings header exists
        header_exists = await page.query_selector("h1:has-text('Application Settings')")
        if header_exists:
            print("Settings page loaded successfully.")
            await page.screenshot(path="settings_page.png")
        else:
            print("Settings page failed to load.")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
