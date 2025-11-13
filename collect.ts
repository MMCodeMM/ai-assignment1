import { chromium } from "playwright";

async function main() {
    let browser = await chromium.launch({ headless: false });
    let page = await browser.newPage();
    let url = "";
    await page.goto(url);
    let downloadImages = await page.evaluate(() => {

    });


    console.log(url, downloadImages);
    await page.close();
    await browser.close();
};

main().catch(e => console.error(e));