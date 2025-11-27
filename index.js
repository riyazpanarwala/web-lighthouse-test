import fs from "fs";
import lighthouse from "lighthouse";
import { launch } from "chrome-launcher";
import os from "os";
import path from "path";

// Load URLs
let urlList = [];
if (fs.existsSync("urls.txt")) {
  urlList = fs
    .readFileSync("urls.txt", "utf-8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("http"));
}

const defaultUrls = [];
const urls = urlList.length ? urlList : defaultUrls;

// create output folder
if (!fs.existsSync("reports")) fs.mkdirSync("reports");

// generate safe file names
const safeName = (url) => {
  const host = new URL(url).hostname.replace(/\./g, "_");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${host}__${stamp}`;
};

// lighthouse runner
async function runLighthouse(url) {
  const chrome = await launch({
    chromeFlags: ["--headless", "--disable-gpu", "--no-sandbox"],
  });

  const options = {
    logLevel: "silent",
    output: ["json", "html"],
    port: chrome.port,
	
    formFactor: "desktop",
    screenEmulation: {
      mobile: false,
      width: 1366,
      height: 768,
      deviceScaleFactor: 1,
      disabled: false,
    },
    locale: "en-US",
  };
  
  const config = {
	  extends: "lighthouse:default",
	  settings: {
		onlyCategories: [
		  "performance",
		  "accessibility",
		  "best-practices",
		  "seo",
		],

		formFactor: "desktop",
		screenEmulation: {
		  mobile: false,
		  width: 1366,
		  height: 768,
		  deviceScaleFactor: 1,
		  disabled: false,
		},

		// ⭐ FIX LANTERN ERRORS
		throttlingMethod: "devtools",
		throttling: {
		  rttMs: 40,
		  throughputKbps: 10240,
		  cpuSlowdownMultiplier: 1,
		}
	  }
	};

  const result = await lighthouse(url, options, config);
  await chrome.kill();

  const name = safeName(url);
  const [jsonReport, htmlReport] = result.report;

  fs.writeFileSync(`reports/${name}.json`, jsonReport);
  fs.writeFileSync(`reports/${name}.html`, htmlReport);

  const lhr = result.lhr;

  return {
    url,
    Performance: Math.round(lhr.categories.performance.score * 100),
    Accessibility: Math.round(lhr.categories.accessibility.score * 100),
    BestPractices: Math.round(lhr.categories["best-practices"].score * 100),
    SEO: Math.round(lhr.categories.seo.score * 100),
  };
}

// Limit concurrency → 10 at a time
async function runInBatches(urls, batchSize = 10) {
  const batches = [];
  for (let i = 0; i < urls.length; i += batchSize) {
    batches.push(urls.slice(i, i + batchSize));
  }

  const results = [];

  for (const batch of batches) {
    console.log(`Running Batch (size ${batch.length})...`);

    const promises = batch.map((u) => runLighthouse(u).catch((err) => ({ url: u, error: err.message })));

    const batchResults = await Promise.all(promises);
    results.push(...batchResults);

    await new Promise((r) => setTimeout(r, 500));
  }

  return results;
}

(async () => {
  const results = await runInBatches(urls, 1);

  // CSV Save
  const header = "URL,Performance,Accessibility,BestPractices,SEO";
  const rows = results.map(
    (r) =>
      `"${r.url}",${r.Performance || ""},${r.Accessibility ||
      ""},${r.BestPractices || ""},${r.SEO || ""}`
  );
  fs.writeFileSync("lighthouse-results.csv", [header, ...rows].join("\n"));

  console.log("✔ Done! HTML + JSON reports saved.");
  console.log("✔ CSV saved as lighthouse-results.csv");
})();
