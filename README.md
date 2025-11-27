# Lighthouse Batch Auditor

This project allows you to run **automated Lighthouse audits** for multiple URLs using Node.js.  
It generates **HTML reports**, **JSON reports**, and a combined **CSV summary** — without using Lighthouse CI.

---

## Features

- Run Lighthouse audits in **headless Chrome**
- Supports **multiple URLs** via `urls.txt`
- Generates:
  - `reports/*.html` (Full Lighthouse report)
  - `reports/*.json`
  - `lighthouse-results.csv` (Summary of all URLs)
- Automatically applies stable **desktop mode configuration**
- Batch processing with **configurable concurrency**
- Fixes common Lighthouse issues such as **Lantern errors**

---

## Project Structure

```
/
├── index.js
├── urls.txt
├── reports/               # auto‑generated HTML + JSON reports
└── lighthouse-results.csv # summary file
```

---

## Setup

### 1. Install dependencies

```bash
npm install lighthouse chrome-launcher
```

### 2. Add URLs

Create a file named **`urls.txt`** (one URL per line):

```
https://example.com
```

If `urls.txt` is empty, the script will run with an empty list.

---

## Run the scanner

```bash
node index.js
```

---

## Output Example (`lighthouse-results.csv`)

```
URL,Performance,Accessibility,BestPractices,SEO
"https://example.com",67,89,93,88
```

---

## Reports

All detailed reports are saved inside the **reports/** folder:

- `hostname__timestamp.html`
- `hostname__timestamp.json`

Example:

```
reports/
├── example_com__2025-01-01T10-21-55-123Z.html
├── example_com__2025-01-01T10-21-55-123Z.json
```

---

## Batch Processing

The script runs URLs in batches:

```js
runInBatches(urls, 5); // 5 URLs at a time
```

You can change the batch size depending on CPU/RAM.

---

## Configurations Used

- Desktop mode
- 1366×768 resolution
- DevTools throttling (stable + fast)
- Categories:
  - Performance
  - Accessibility
  - Best Practices
  - SEO

## Result

After running:

```
✔ Done! HTML + JSON reports saved.
✔ CSV saved as lighthouse-results.csv
```
