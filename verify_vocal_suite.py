import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context()
        page = await context.new_page()

        try:
            # Let the server some time to start.
            await page.goto("http://localhost:4200/vocal-suite", timeout=60000)
            await page.wait_for_timeout(10000) # Give more time for overall UI to settle

            # Screenshot of default pipeline view
            await page.screenshot(path="vocal_suite_pipeline.png")
            print("Captured vocal_suite_pipeline.png")

            # Switch to console mode - use more specific selector
            await page.locator('nav button').filter(has_text='Console').click()
            await page.wait_for_timeout(2000)
            await page.screenshot(path="vocal_suite_console.png")
            print("Captured vocal_suite_console.png")

            # Step by step verification
            await page.locator('nav button').filter(has_text='Pipeline').click()
            await page.locator('button').filter(has_text='setup').click()
            await page.wait_for_timeout(1000)
            await page.screenshot(path="vocal_suite_setup.png")
            print("Captured vocal_suite_setup.png")

        except Exception as e:
            print(f"Error during verification: {e}")
        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
