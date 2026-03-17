import asyncio
from playwright.async_api import async_playwright
import subprocess
import time
import os

async def run():
    print("Building application for verification...")
    build_proc = subprocess.run(['npm', 'run', 'build'], capture_output=True, text=True)
    if build_proc.returncode != 0:
        print("Build failed")
        print(build_proc.stderr)
        return

    print("Starting preview server...")
    # Based on angular.json outputPath is "Build"
    proc = subprocess.Popen(['npx', 'serve', '-s', 'Build/browser', '-p', '4200'], stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    time.sleep(5)

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        try:
            # Go to Strategy Hub
            await page.goto('http://localhost:4200/strategy', timeout=60000)
            await page.wait_for_timeout(2000)
            await page.screenshot(path='strategy_hub_intel.png', full_page=True)
            print("Captured strategy_hub_intel.png")

            # Go to Career Hub (Command Center)
            await page.goto('http://localhost:4200/career', timeout=60000)
            await page.wait_for_timeout(2000)
            await page.screenshot(path='command_center_ticker.png', full_page=True)
            print("Captured command_center_ticker.png")
        except Exception as e:
            print(f"Error during verification: {e}")
        finally:
            await browser.close()

    print("Stopping preview server...")
    proc.terminate()

if __name__ == "__main__":
    asyncio.run(run())
