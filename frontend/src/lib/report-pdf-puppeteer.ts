import type { Browser } from "puppeteer-core";

const LAUNCH_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--font-render-hinting=none",
];

let browserPromise: Promise<Browser> | null = null;

async function resolveExecutablePath(): Promise<string> {
  if (process.env.PUPPETEER_EXECUTABLE_PATH?.trim()) {
    return process.env.PUPPETEER_EXECUTABLE_PATH.trim();
  }

  if (process.platform === "linux") {
    const { existsSync } = await import("fs");
    for (const candidate of ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"]) {
      if (existsSync(candidate)) return candidate;
    }
  }

  if (process.platform === "win32") {
    const { existsSync } = await import("fs");
    const candidates = [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    ];
    for (const candidate of candidates) {
      if (existsSync(candidate)) return candidate;
    }
  }

  if (process.env.NODE_ENV === "development") {
    const puppeteer = await import("puppeteer");
    return puppeteer.default.executablePath();
  }

  throw new Error(
    "Chromium not found. Set PUPPETEER_EXECUTABLE_PATH or install Google Chrome / Chromium.",
  );
}

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = (async () => {
      const puppeteer = await import("puppeteer-core");
      const executablePath = await resolveExecutablePath();
      return puppeteer.default.launch({
        executablePath,
        headless: true,
        args: LAUNCH_ARGS,
      });
    })();
  }
  return browserPromise;
}

export async function generatePdfFromHtml(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "load", timeout: 60_000 });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}
