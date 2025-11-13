// collect.ts
import { chromium } from "playwright";
import fs from "fs-extra";
import path from "path";
import axios from "axios";

type ImgMeta = { id: string; url: string; alt: string; sourceQuery: string };

const OUTPUT_DIR = path.resolve(process.cwd(), "images");
const PER_QUERY_LIMIT = 200; // 每個搜尋詞想抓的上限（可依需求調整）
const SCROLL_ITER = 12; // 每次滾動次數
const SCROLL_PAUSE_MS = 800;

function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
}

async function ensureOut() {
    await fs.ensureDir(OUTPUT_DIR);
}

async function downloadToFile(url: string, outPath: string) {
    if (url.startsWith("data:")) {
        // data URL
        const match = url.match(/^data:(image\/\w+);base64,(.+)$/);
        if (!match) throw new Error("Invalid data URL");
        const b64 = match[2];
        const buf = Buffer.from(b64, "base64");
        await fs.writeFile(outPath, buf);
        return buf.length;
    } else {
        const res = await axios.get<ArrayBuffer>(url, {
            responseType: "arraybuffer",
            timeout: 15000,
            headers: {
                // 有時候反爬需要 User-Agent
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)",
                Accept: "image/*,*/*;q=0.8",
            },
            maxContentLength: 50 * 1024 * 1024, // 50MB 上限
        });
        const buf = Buffer.from(res.data);
        await fs.writeFile(outPath, buf);
        return buf.length;
    }
}

async function collectImageUrlsFromPage(page: any, limit: number) {
    // 在 page 裡滾動並蒐集 img 元素的多種可能屬性
    const collected = new Map<string, ImgMeta>();

    for (let i = 0; i < SCROLL_ITER; i++) {
        const items: ImgMeta[] = await page.evaluate(() => {
            const nodes = Array.from(document.querySelectorAll("img"));
            const out: Array<{ url: string; alt: string }> = [];
            for (const img of nodes) {
                // 優先取各種可能藏真正圖片 url 的屬性
                const attrs = [
                    img.getAttribute("src"),
                    img.getAttribute("data-src"),
                    img.getAttribute("data-iurl"),
                    // bing thumbnails sometimes use "data-src" or src
                ];
                const url = attrs.find((u) => u && u.length > 0) || "";
                if (!url) continue;
                out.push({ url, alt: img.getAttribute("alt") || "" });
            }
            return out;
        });

        for (const it of items) {
            const u = it.url;
            if (!u) continue;
            // 過濾掉 tiny placeholders
            if (u.startsWith("http") || u.startsWith("data:")) {
                if (!collected.has(u)) {
                    collected.set(u, { id: `${collected.size + 1}`, url: u, alt: it.alt || "", sourceQuery: "" });
                }
            }
            if (collected.size >= limit) break;
        }

        if (collected.size >= limit) break;
        // 滾動
        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await sleep(SCROLL_PAUSE_MS);
    }

    return Array.from(collected.values());
}

async function collectForQuery(browser: any, query: string, limit = PER_QUERY_LIMIT) {
    const page = await browser.newPage();
    // 使用 Bing images（相對簡單）
    const url = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}`;
    await page.goto(url, { waitUntil: "domcontentloaded" });

    // 嘗試點「顯示更多」或滾動幾次
    try {
        await page.waitForTimeout(800);
        // 若有按鈕可點，嘗試點一次（部分情況會有）
        const loadMore = await page.$("a[id='b_more']");
        if (loadMore) {
            try {
                await loadMore.click();
                await page.waitForTimeout(800);
            } catch { }
        }
    } catch { }

    const items = await collectImageUrlsFromPage(page, limit);
    // 標記來源 query
    items.forEach((it, idx) => (it.id = `${query.replace(/\s+/g, "_")}_${idx + 1}`, it.sourceQuery = query));
    await page.close();
    return items;
}

async function main() {
    await ensureOut();

    // 這裡給一組貓咪品種作為範例（你可以改、加、減）
    const queries = [
        "Siamese cat",
        "Persian cat",
        "Maine Coon",
        "Ragdoll cat",
        "Bengal cat",
        "British Shorthair",
        "Scottish Fold",
        "Sphynx cat",
        "Norwegian Forest cat",
        "Russian Blue"
    ];

    // 若要使用中文搜尋詞，也沒問題，例如： "布偶貓", "英國短毛貓"
    // const queries = ["布偶貓","英國短毛貓", ...];

    const browser = await chromium.launch({ headless: false });
    const allMeta: ImgMeta[] = [];

    for (const q of queries) {
        console.log(`[+] 開始搜尋: ${q}`);
        try {
            const items = await collectForQuery(browser, q, PER_QUERY_LIMIT);
            console.log(`    找到 ${items.length} 張候選圖片`);
            allMeta.push(...items);
            // 小休息，避免被視為攻擊流量
            await sleep(1200);
        } catch (err) {
            console.error(`    搜尋 ${q} 時發生錯誤:`, err);
        }
    }

    // 儲存 metadata（先不下載全部）
    const metaPath = path.join(OUTPUT_DIR, "metadata.json");
    await fs.writeJSON(metaPath, allMeta, { spaces: 2 });
    console.log(`[i] 已將 metadata 存為 ${metaPath} （總候選數: ${allMeta.length}）`);

    // 接下來開始下載（示範下載，不會一次下載超大量）
    console.log("[i] 開始下載圖片（示範，會逐一嘗試）...");
    const stats = { ok: 0, err: 0 };
    for (const m of allMeta) {
        const safeQueryDir = path.join(OUTPUT_DIR, sanitizeFilename(m.sourceQuery || "unknown"));
        await fs.ensureDir(safeQueryDir);
        const ext = guessExtFromUrl(m.url) || "jpg";
        const out = path.join(safeQueryDir, `${m.id}.${ext}`);
        try {
            if (await fs.pathExists(out)) {
                // 已下載過
                stats.ok++;
                continue;
            }
            const size = await downloadToFile(m.url, out);
            console.log(`    ✓ ${path.basename(out)} (${Math.round(size / 1024)} KB)`);
            stats.ok++;
        } catch (err: any) {
            console.warn(`    ✗ 下載失敗: ${m.url} => ${String(err.message || err)}`);
            stats.err++;
        }
        // 小 pause
        await sleep(150);
    }

    console.log(`[DONE] 下載完成：成功 ${stats.ok}, 失敗 ${stats.err}`);
    await browser.close();
}

function sanitizeFilename(s: string) {
    return s.replace(/[<>:"\/\\|?*\x00-\x1F]/g, "_").slice(0, 120);
}

function guessExtFromUrl(url: string) {
    try {
        const u = url.split("?")[0];
        const ext = path.extname(u).replace(".", "").toLowerCase();
        if (["jpg", "jpeg", "png", "gif", "webp", "bmp"].includes(ext)) return ext;
        if (url.startsWith("data:image/")) {
            const m = url.match(/^data:image\/([^;]+)/);
            if (m) return m[1];
        }
        return null;
    } catch {
        return null;
    }
}

main().catch((e) => {
    console.error("Fatal:", e);
    process.exit(1);
});
