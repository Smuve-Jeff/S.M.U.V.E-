import asyncio
from playwright.async_api import async_playwright

async def run():
    async def wait_for_server(url, timeout=60):
        import time
        start_time = time.time()
        while time.time() - start_time < timeout:
            try:
                import urllib.request
                urllib.request.urlopen(url)
                return True
            except:
                await asyncio.sleep(1)
        return False

    if not await wait_for_server("http://localhost:4200"):
        print("Server not found")
        return

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_row_page() if hasattr(browser, 'new_row_page') else await browser.new_page()

        # Navigate to Studio (Piano Roll is usually here)
        await page.goto("http://localhost:4200/studio")
        await page.wait_for_timeout(3000)

        # Take screenshot of the new Piano Roll High-Voltage UI
        await page.screenshot(path="piano_roll_high_voltage.png", full_page=True)
        print("Screenshot saved to piano_roll_high_voltage.png")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
