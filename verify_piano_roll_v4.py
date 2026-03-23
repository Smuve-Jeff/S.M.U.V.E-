import asyncio
from playwright.async_api import async_playwright

async def run():
    async def wait_for_server(url, timeout=60, interval=1.0):
        deadline = time.monotonic() + timeout
        async with httpx.AsyncClient(follow_redirects=True, timeout=5.0) as client:
            while time.monotonic() < deadline:
                try:
                    resp = await client.get(url)
                    # Consider the server "up" if we get any non-5xx response.
                    if resp.status_code < 500:
                        return True
                except (httpx.RequestError, httpx.TimeoutException):
                    pass
                await asyncio.sleep(interval)
        return False

    if not await wait_for_server("http://localhost:4200"):
        print("Server not found")
        return

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        # Navigate to Studio (Piano Roll is usually here)
        await page.goto("http://localhost:4200/piano-roll")
        await page.wait_for_timeout(3000)

        # Take screenshot of the new Piano Roll High-Voltage UI
        await page.screenshot(path="piano_roll_high_voltage.png", full_page=True)
        print("Screenshot saved to piano_roll_high_voltage.png")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
