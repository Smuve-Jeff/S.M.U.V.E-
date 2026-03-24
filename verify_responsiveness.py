import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch()

        # Desktop View
        page = await browser.new_page(viewport={'width': 1280, 'height': 800})
        await page.goto('http://localhost:4200/')
        await page.wait_for_timeout(10000)
        await page.screenshot(path='desktop_hub_v42.png')

        # Mobile View
        mobile_page = await browser.new_page(viewport={'width': 390, 'height': 844})
        await mobile_page.goto('http://localhost:4200/')
        await mobile_page.wait_for_timeout(10000)
        await mobile_page.screenshot(path='mobile_hub_v42.png')

        # Check Tha Spot
        await mobile_page.goto('http://localhost:4200/tha-spot')
        await mobile_page.wait_for_timeout(10000)
        await mobile_page.screenshot(path='mobile_tha_spot_v42.png')

        # Check Cinema Engine
        await mobile_page.goto('http://localhost:4200/image-video-lab')
        await mobile_page.wait_for_timeout(10000)
        await mobile_page.screenshot(path='mobile_cinema_v42.png')

        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
