import asyncio
from playwright.async_api import async_playwright
import os

async def verify():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        # Increase timeout for potential slow local dev server
        page.set_default_timeout(60000)

        try:
            await page.goto("http://localhost:4200")
            await page.wait_for_selector("app-root")

            # Verify Online Status and Latency in Header
            await page.screenshot(path="final_header_check.png")

            # Toggle Performance Mode
            perf_btn = page.locator("button[title*='Performance Mode']")
            await perf_btn.click()
            await page.wait_for_timeout(500)
            await page.screenshot(path="final_perf_mode_active.png")

            # Check DJ Booth Vinyls
            await page.goto("http://localhost:4200/dj")
            await page.wait_for_selector("app-dj-deck")
            # Wait for vinyl images to load (picsum)
            await page.wait_for_timeout(2000)
            await page.screenshot(path="final_dj_vinyl_check.png")

            # Trigger Audit in Hub
            await page.goto("http://localhost:4200/hub")
            await page.wait_for_selector("app-command-center")
            # The audit button might be the profile audit button or /audit command
            # Using /audit command in terminal
            await page.fill("input[placeholder*='ENTER SYSTEM COMMAND']", "/audit")
            await page.press("input[placeholder*='ENTER SYSTEM COMMAND']", "Enter")
            await page.wait_for_timeout(1000)
            await page.screenshot(path="final_audit_command_response.png")

            print("Verification successful. Screenshots generated.")

        except Exception as e:
            print(f"Verification failed: {e}")
            await page.screenshot(path="final_error_verification.png")
        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(verify())
