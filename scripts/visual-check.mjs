import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const OUT = "output/playwright";
mkdirSync(OUT, { recursive: true });

const shots = [
  { name: "overview-light", theme: "light", width: 1440, height: 900, page: "overview" },
  { name: "overview-dark", theme: "dark", width: 1440, height: 900, page: "overview" },
  { name: "overview-960", theme: "light", width: 960, height: 640, page: "overview" },
  { name: "overview-640", theme: "light", width: 640, height: 720, page: "overview" },
  { name: "accounts-light", theme: "light", width: 1440, height: 900, page: "accounts" },
  { name: "accounts-dark", theme: "dark", width: 1440, height: 900, page: "accounts" },
  { name: "settings-light", theme: "light", width: 1440, height: 900, page: "settings" },
  { name: "settings-dark", theme: "dark", width: 1440, height: 900, page: "settings" },
  { name: "add-account-dialog", theme: "light", width: 1280, height: 800, page: "accounts", dialog: true },
];

const browser = await chromium.launch({
  executablePath:
    process.env.PLAYWRIGHT_CHROME ??
    "/home/shallow/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome",
  args: ["--no-sandbox", "--headless=new"],
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
  reducedMotion: "reduce",
});
const page = await context.newPage();
page.on("console", (m) => {
  if (m.type() === "error") console.error("PAGE ERR:", m.text());
});

await page.goto("http://127.0.0.1:1420/");

for (const shot of shots) {
  await page.evaluate((t) => {
    document.documentElement.dataset.theme = t;
    document.documentElement.dataset.transparency = "on";
  }, shot.theme);
  await page.evaluate((p) => {
    const nav = [...document.querySelectorAll("nav button")];
    const target = nav.find((b) => b.textContent?.includes(
      p === "overview" ? "概览" : p === "accounts" ? "账号" : "设置"
    ));
    target?.click();
  }, shot.page);
  await page.waitForTimeout(900);
  await page.setViewportSize({ width: shot.width, height: shot.height });
  await page.waitForTimeout(300);

  if (shot.dialog) {
    const addBtn = [...await page.$$("button")].find((b) =>
      (b.textContent ?? "").includes("添加账号"),
    );
    await addBtn?.click();
    await page.waitForTimeout(500);
    // 步进到第二步展示凭据与出口
    const next = [...await page.$$("button")].find((b) =>
      (b.textContent ?? "").includes("下一步"),
    );
    await next?.click();
    await page.waitForTimeout(300);
  }

  await page.screenshot({ path: `${OUT}/${shot.name}.png`, fullPage: false });
  console.log("shot:", shot.name);
}

await browser.close();
console.log("done");