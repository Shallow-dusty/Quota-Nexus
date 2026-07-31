import { chromium } from "playwright-core";
import { existsSync, mkdirSync } from "node:fs";

const OUT = "output/playwright";
mkdirSync(OUT, { recursive: true });

const shots = [
  { name: "overview-light", theme: "light", width: 1440, height: 900, page: "overview" },
  { name: "overview-dark", theme: "dark", width: 1440, height: 900, page: "overview" },
  { name: "overview-solid", theme: "light", transparency: "off", width: 1440, height: 900, page: "overview" },
  { name: "overview-960", theme: "light", width: 960, height: 640, page: "overview" },
  { name: "overview-640", theme: "light", width: 640, height: 720, page: "overview" },
  { name: "accounts-light", theme: "light", width: 1440, height: 900, page: "accounts" },
  { name: "accounts-dark", theme: "dark", width: 1440, height: 900, page: "accounts" },
  { name: "settings-light", theme: "light", width: 1440, height: 900, page: "settings" },
  { name: "settings-dark", theme: "dark", width: 1440, height: 900, page: "settings" },
  { name: "add-account-dialog", theme: "light", width: 1280, height: 800, page: "accounts", dialog: true },
];

const executableCandidates = [
  process.env.PLAYWRIGHT_CHROME,
  process.platform === "win32"
    ? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
    : undefined,
  process.platform === "win32"
    ? "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
    : undefined,
  process.platform === "win32"
    ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
    : undefined,
  process.platform === "linux"
    ? "/home/shallow/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome"
    : undefined,
].filter(Boolean);
const executablePath = executableCandidates.find((candidate) => existsSync(candidate));

if (!executablePath) {
  throw new Error(
    "No Chromium executable found. Set PLAYWRIGHT_CHROME to a local Edge/Chrome/Chromium path.",
  );
}

const browser = await chromium.launch({
  executablePath,
  args: ["--no-sandbox", "--headless=new"],
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
  reducedMotion: "reduce",
});
const page = await context.newPage();
const browserProblems = [];
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") {
    browserProblems.push(`${m.type().toUpperCase()}: ${m.text()}`);
  }
});
page.on("pageerror", (error) => browserProblems.push(`PAGE ERROR: ${error.message}`));

await page.goto("http://127.0.0.1:1420/", { waitUntil: "networkidle" });
await page.getByRole("heading", { name: "概览" }).waitFor({ state: "visible" });

for (const shot of shots) {
  await page.evaluate(({ theme, transparency }) => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.transparency = transparency ?? "on";
  }, shot);
  await page.evaluate((p) => {
    const nav = [...document.querySelectorAll("nav button")];
    const target = nav.find((b) => b.textContent?.includes(
      p === "overview" ? "概览" : p === "accounts" ? "账号" : "设置"
    ));
    target?.click();
  }, shot.page);
  const expectedHeading =
    shot.page === "overview" ? "概览" : shot.page === "accounts" ? "账号与连接" : "设置";
  await page.getByRole("heading", { name: expectedHeading }).waitFor({ state: "visible" });
  await page.setViewportSize({ width: shot.width, height: shot.height });
  await page.waitForTimeout(250);

  if (shot.dialog) {
    await page.getByRole("button", { name: "添加账号" }).click();
    await page.getByRole("dialog", { name: "添加账号" }).waitFor();
    await page.getByRole("button", { name: /OpenCode Go/ }).click();
    await page.getByRole("button", { name: "下一步" }).click();
    await page.getByText("凭据来源").waitFor();
  }

  const visibleText = (await page.locator("body").innerText()).trim();
  if (visibleText.length < 40 || !visibleText.includes(expectedHeading)) {
    throw new Error(`Blank or incomplete render detected before ${shot.name}`);
  }

  const screenshot = await page.screenshot({
    path: `${OUT}/${shot.name}.png`,
    fullPage: false,
  });
  if (screenshot.byteLength < 40_000) {
    throw new Error(`Suspiciously small screenshot for ${shot.name}: ${screenshot.byteLength} bytes`);
  }
  console.log("shot:", shot.name);
}

await browser.close();
if (browserProblems.length > 0) {
  throw new Error(`Browser console was not clean:\n${browserProblems.join("\n")}`);
}
console.log("done");
