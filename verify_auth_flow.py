import asyncio
from playwright.async_api import async_playwright
import os

async def verify_flow():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context(viewport={'width': 1280, 'height': 800})
        page = await context.new_page()

        # Target the login page
        await page.goto('http://localhost:4200/login')
        await page.wait_for_timeout(3000)
        await page.screenshot(path='login_page.png')
        print("Captured login page")

        # Click the toggle button to switch to Register
        # The selector targets the button in the bottom section
        await page.click('.mt-10 button')
        await page.wait_for_timeout(1000)
        await page.screenshot(path='register_page.png')
        print("Captured register page")

        # Fill out registration
        await page.fill('input[placeholder="STAGE NAME"]', 'VerifArtist')
        await page.fill('input[placeholder="EMAIL ADDRESS"]', 'verif@example.com')
        await page.fill('input[placeholder="PASSWORD"]', 'secure-pass-123')

        # Initialize Genesis (Register)
        await page.click('button:has-text("Initialize Genesis")')
        await page.wait_for_timeout(3000)
        await page.screenshot(path='verification_prompt.png')
        print("Captured verification prompt")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(verify_flow())
