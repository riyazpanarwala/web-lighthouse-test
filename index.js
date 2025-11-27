import fs from "fs";
import lighthouse from "lighthouse";
import { launch } from "chrome-launcher";
import { program } from "commander";

// Setup command line options
program
  .option('-o, --output <filename>', 'output filename', 'lighthouse-results')
  .option('-u, --urls <file>', 'URLs file', 'urls.txt')
  .option('-r, --retries <number>', 'number of retries on failure', '2')
  .option('-t, --timeout <number>', 'timeout in seconds', '45')
  .parse();

const options = program.opts();
const retries = parseInt(options.retries);
const timeout = parseInt(options.timeout);

// Load URLs
function loadUrls() {
  let urlList = [];
  
  if (!fs.existsSync(options.urls)) {
    urlList = fs
      .readFileSync(options.urls, "utf-8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("http") && validateUrl(l));
    
    console.log(`Loaded ${urlList.length} URLs from ${options.urls}`);
  } else {
    console.log(`URLs file ${options.urls} not found, using default URLs`);
  }

  const defaultUrls = [
    "https://ascenten.net/culture.html",
    "https://ascenten.net/affirmative-action-policy.html",
  ];
   
  return urlList.length ? urlList : defaultUrls;
}

// Validate URL format
function validateUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    console.warn(`Invalid URL skipped: ${url}`);
    return false;
  }
}

// Create output folder
function ensureOutputDir() {
  if (!fs.existsSync("reports")) {
    fs.mkdirSync("reports");
  }
}

// Generate safe file names
function safeName(url) {
  const host = new URL(url).hostname.replace(/\./g, "_");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${host}__${stamp}`;
}

// Lighthouse configuration
function getLighthouseConfig() {
  return {
    extends: "lighthouse:default",
    settings: {
      onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
      formFactor: "desktop",
      screenEmulation: {
        mobile: false,
        width: 1366,
        height: 768,
        deviceScaleFactor: 1,
        disabled: false,
      },
      locale: "en-US",
      throttlingMethod: "devtools",
      throttling: {
        rttMs: 40,
        throughputKbps: 10240,
        cpuSlowdownMultiplier: 1,
      },
      maxWaitForLoad: timeout * 1000,
      disableStorageReset: true,
      skipAboutBlank: true,
    }
  };
}

// Lighthouse runner with enhanced error handling
async function runLighthouse(url) {
  let chrome;
  try {
    chrome = await launch({
      chromeFlags: [
        "--headless", 
        "--disable-gpu", 
        "--no-sandbox", 
        "--disable-dev-shm-usage",
        "--disable-setuid-sandbox"
      ]
    });

    const lighthouseOptions = {
      logLevel: "info",
      output: ["json", "html"],
      port: chrome.port,
      onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
      maxWaitForLoad: timeout * 1000,
    };

    const config = getLighthouseConfig();
    const result = await lighthouse(url, lighthouseOptions, config);

    const name = safeName(url);
    const [jsonReport, htmlReport] = result.report;

    fs.writeFileSync(`reports/${name}.json`, jsonReport);
    fs.writeFileSync(`reports/${name}.html`, htmlReport);

    const lhr = result.lhr;

    const scores = {
      url,
      Performance: lhr.categories.performance ? Math.round(lhr.categories.performance.score * 100) : "N/A",
      Accessibility: lhr.categories.accessibility ? Math.round(lhr.categories.accessibility.score * 100) : "N/A",
      BestPractices: lhr.categories["best-practices"] ? Math.round(lhr.categories["best-practices"].score * 100) : "N/A",
      SEO: lhr.categories.seo ? Math.round(lhr.categories.seo.score * 100) : "N/A",
      error: null
    };
    return scores;
  } catch (error) {
    console.error(`Error testing ${url}:`, error.message);
    return { 
      url, 
      error: error.message,
      Performance: "N/A",
      Accessibility: "N/A", 
      BestPractices: "N/A",
      SEO: "N/A"
    };
  } finally {
    if (chrome) await chrome.kill();
  }
}

// Retry logic for failed tests
async function runLighthouseWithRetry(url, maxRetries = retries) {
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      if (attempt > 1) {
        console.log(`Retrying ${url} (attempt ${attempt}/${maxRetries + 1})...`);
        await new Promise(r => setTimeout(r, 3000)); // Wait 3 seconds between retries
      }
      
      const result = await runLighthouse(url);
      
      if (!result.error) {
        return result;
      }
      
      if (result.error && attempt <= maxRetries) {
        continue; // Retry if there was an error
      }
      
      return result;
    } catch (error) {
      console.error(`Attempt ${attempt} failed for ${url}:`, error.message);
      
      if (attempt > maxRetries) {
        console.error(`All retries failed for ${url}`);
        return { 
          url, 
          error: error.message,
          Performance: "N/A",
          Accessibility: "N/A", 
          BestPractices: "N/A",
          SEO: "N/A"
        };
      }
    }
  }
}

// Sequential processing (no batches)
async function runAllTests(urls) {
  const results = [];
  let completed = 0;
  const total = urls.length;

  console.log(`\n Starting Lighthouse analysis for ${total} URLs...`);

  for (const url of urls) {
    completed++;
    console.log(`\n[${completed}/${total}] Testing: ${url}`);
    
    const result = await runLighthouseWithRetry(url);
    results.push(result);
    
    // Small delay between tests to avoid overwhelming the system
    if (completed < total) {
      console.log("Waiting 2 seconds before next test...");
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  return results;
}

// Generate CSV report
function generateCSV(results) {
  const header = "URL,Performance,Accessibility,BestPractices,SEO,Error";
  const rows = results.map(r => 
    `"${r.url}",${r.Performance || ""},${r.Accessibility || ""},${r.BestPractices || ""},${r.SEO || ""},"${r.error || ""}"`
  );
  
  const filename = `${options.output}.csv`;
  fs.writeFileSync(filename, [header, ...rows].join("\n"));
  return filename;
}

// Main execution
async function main() {
  console.log("Lighthouse Batch Runner");
  
  // Load and validate URLs
  const urls = loadUrls();
  
  if (urls.length === 0) {
    console.log("No valid URLs to test. Exiting.");
    process.exit(1);
  }
  
  // Ensure output directory exists
  ensureOutputDir();
  
  // Run Lighthouse tests sequentially
  const startTime = Date.now();
  const results = await runAllTests(urls);
  const endTime = Date.now();
  
  // Generate reports
  const csvFile = generateCSV(results);
  
  console.log(`\n  Total execution time: ${((endTime - startTime) / 1000 / 60).toFixed(2)} minutes`);
  console.log(`Reports saved in: ./reports/`);
  console.log(`CSV results: ${csvFile}`);
}

// Error handling for main execution
main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});