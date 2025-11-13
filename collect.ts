import { chromium } from "playwright";

async function main() {
    let browser = await chromium.launch({ headless: false });
    let page = await browser.newPage();
    let url = "https://www.google.com/search?sca_esv=a8d30f993b93fd1a&rlz=1C1ONGR_zh-HKHK969HK969&sxsrf=AE3TifOgvM7Wlqlmg14bMdA_ddgkdrrhUw:1763034028608&udm=2&fbs=AIIjpHybaGNnaZw_4TckIDK59RtxQXhK6kI3AtAFLvuO8MTsf1dhPO6-sEXN-XVzE9goeJTkboC4w3niysEaAyp4jNG_HdQgodboIIa8y-qaOV-oZjUKECUG0NhQYGuwAxkfvJrzsmzmKOmlxewwSDV_1RnWQn6DMX3xl3TGMzGk8P0KMotVmQqULUR4H95bhIVuGlj3pqUH&q=%E5%90%84%E9%A1%9E%E5%9E%8B%E7%9A%84%E8%B2%93%E5%92%AA%E5%93%81%E7%A8%AE&sa=X&ved=2ahUKEwib9oHIhe-QAxU6oa8BHQ78Jn4QtKgLegQIERAB&biw=1536&bih=695&dpr=1.25";
    await page.goto(url);

    await page.close();
    await browser.close();
};

main().catch(e => console.error(e));