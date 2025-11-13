import { chromium } from "playwright"

async function main() {

    let browser = await chromium.launch({ headless: false });
    let page = await browser.newPage();
    let url = "https://google.com";
    await page.goto(url);
    let tittle = await page.evaluate(() => {
        return document.title
    });
    console.log(url, tittle);
    await page.close();
    await browser.close();
}

main().catch(e => console.error(e));
