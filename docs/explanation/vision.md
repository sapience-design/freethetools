# Vision: the tool site people trust with anything

Proposed 06.10.2026 by Sapience Design. The order of work is in [TODO.md](../../TODO.md) under "Roadmap".

Free the Tools aims to be the first place anyone goes to do something to a file or a piece of text. It wins in three ways:

- It does each job better than any other site.
- The file never leaves the device, and anyone can check that.
- It stays free with no limits, for good.

The last promise is unusual, and we can keep it because the visitor's device does the work. Serving a million people costs about what serving one does.

## What "greatest" means

Each aim has a measure, so we can tell whether it is working.

| Aim | Today (06.10.2026) | Target |
|---|---|---|
| Covers the jobs people search for | 25 tools; search demand not yet measured | The 100 most-searched file and text jobs that can run in a browser |
| Best result for each job | Not compared | At least equal to the best paid site on a public benchmark, for the top 10 jobs |
| Works for people | "Worked" rate per tool on [/stats/](https://freethetools.com/stats/) | 95% or more for every tool that produces a file |
| Speaks the visitor's language | English | The 10 languages that bring the most search demand |
| Works without a connection | No | Every tool, after the first visit |
| Privacy anyone can check | Enforced by the Content Security Policy and tests | Shown live on every tool page, and builds anyone can verify |
| Limits | None | None, including files over 1 GB where the device can hold them |

## Why we can win

**Our costs don't grow with use.** iLovePDF, Smallpdf, TinyWow and CloudConvert process files on their own servers. Every file costs them money, so they cap file sizes and daily tasks and sell the rest. Here the visitor's browser does the work, and static files on Cloudflare are free to serve. "No limits" is a promise we can keep, and they cannot match it without rebuilding.

**People check privacy claims.** In omni-tools, an issue with +9 reactions reports that its "nothing leaves your device" claim was false. We already enforce the claim with the Content Security Policy and with tests. The next step is to let every visitor see it.

**Anyone can add a tool.** Each tool lives in its own folder, and contributors never edit shared files. A contributor can add a tool in an afternoon. That is how the catalogue grows past what one team could build.

## Seven moves

### 1. Be the best at the ten biggest jobs

Most visits will come from a few jobs: compressing, merging and splitting PDFs, filling PDF forms, compressing and converting images, and HEIC to JPG. PDF to Word is probably among them too *(not checked)*. Winning these matters more than adding the 200th tool.

- Use stronger engines:
  - Squoosh's codecs (MozJPEG, OxiPNG, AVIF) through jSquash, for images.
  - MuPDF.js, for PDF rendering, text extraction and true redaction.
  - WebCodecs with Mediabunny, for audio and video without ffmpeg.
- Publish an open benchmark against the paid sites: output size, visible quality and time, with the test files in the repo. Anyone can rerun it.
- Handle big files by streaming them and storing them in the browser's private file system (OPFS), not in memory.

### 2. Privacy you can watch

- **A proof panel on every tool.** It lists every request the page made, read from the browser's own Resource Timing and Content Security Policy reports. It also shows "0 bytes have left this device since you added a file". No competitor shows this.
- **Works offline.** A service worker keeps every tool available after the first visit. "Turn off your Wi-Fi and try it" is the simplest proof there is.
- **Verifiable builds.** Publish the SHA-256 hash of every deployed file, built in public CI, so anyone can check that the site runs the code in the repository. Meta's Code Verify does this for WhatsApp Web.

### 3. Tools that work together

- **One drop zone for everything.** Drop any file anywhere on the site to see every tool that can take it. The File Converter is the first version.
- **Hand results on.** A finished result offers the next likely step ("Compress it", "Merge with another") without adding the file again.
- **Recipes.** Chain steps, such as merge, then rotate, then compress. Save a recipe in the browser, or share it as a link. The link carries the steps, never the files.
- **Whole folders.** Process a folder and write the results back to it, in browsers that allow folder access.

### 4. AI that stays on the device

The jobs that competitors now sell as "AI", done on the visitor's device:

| Job | Engine (licence) |
|---|---|
| Make scanned PDFs searchable (OCR) | tesseract.js (Apache-2.0) |
| Remove an image background | @imgly/background-removal (AGPL-3.0) |
| Speech to text | Whisper through transformers.js, on WebGPU (Apache-2.0) |
| Translate a document | Bergamot, the engine behind Firefox's offline translation (MPL-2.0); Chrome's built-in Translator where present |
| Find and remove personal data in a PDF | MuPDF.js redaction (AGPL-3.0) with a local entity model |

Models are large. We serve them from our own origin, so the Content Security Policy stays unchanged. Files over Cloudflare's per-file limit go to R2 behind the Worker. The browser caches each model after one download, and the page shows the download size first. We use only models with open licences; several popular ones forbid commercial use.

### 5. Every language

People search for these jobs in their own language: "comprimir pdf", "pdf verkleinern", "PDF 圧縮". Localised pages (`/es/pdf/compress/`) with translated `tool.json` fields and interface text open most of the world's search demand. Search Console data picks the first languages. Contributors translate, and machine drafts stay marked until a person reviews them.

### 6. Everywhere people work

- **An installable app.** It appears in "Open with" on desktop computers (File Handling API) and in the share sheet on Android (Web Share Target).
- **A command line and an MCP server.** They run the same `core.js` on the user's own machine. Claude, ChatGPT and other assistants can then use the tools without uploading anything. In omni-tools, users asked for an MCP server (+5 reactions).
- **WebMCP**, when browsers ship it, so AI agents in the browser can call the tools on the page.
- **A browser extension** that strips location data from any photo as you upload it, on any site. It puts privacy at the point of upload.

### 7. Built by many, kept by few

- Shared interface components, after the theme is final (B8), so a contributor's tool looks finished on day one.
- Automated review: the benchmark, accessibility checks, a size budget and the outside-request guard run on every pull request. Review time is the bottleneck, so machines do the checking.
- Good first issues and events such as Hacktoberfest bring new contributors.

## Stay free at any scale

Server cost grows only with the anonymous stats. The free plan covers about 25,000 visits a day (ADR 0007). Above that, the browser sends stats for a sample of visits, for example 1 in 10, counted ten times. That keeps the totals accurate and the cost at zero. Model files on R2 cost nothing to download. Any paid plan needs a proposal that first shows the free routes are used up.

## What would prove this wrong

- **People choose by search rank, not privacy.** This is likely for most visitors. That is why moves 1 and 5 (quality and language) come first: they win the search. Privacy is why visitors stay and recommend the site.
- **Browsers differ.** Safari lacks folder access and parts of WebGPU, and phones have little memory. Every tool must still work in a simpler way where an API is missing.
- **Maintainer time runs out.** More tools mean more reviews. If the first review takes longer than a week, accept fewer new tools and automate more checks.
- **Model licences.** A model with a closed licence cannot ship, however good it is.

## How we decide what comes next

1. Search Console shows which jobs and languages people search for. It is free and takes ten minutes to set up (O2), so it comes first.
2. Rank jobs by search demand times how far we are from the best result.
3. Fix or remove any tool whose "Worked" rate stays below 90% for 30 days.
4. Record each lasting decision as an ADR: model hosting, language URLs, recipes and the proof panel.

## Ideas we are not pursuing

| Idea | Why not |
|---|---|
| Accounts, cloud storage or sync | They break the promise, and there is nothing to sync |
| Ads or a paid tier | We don't need the money per user, and ads need third-party scripts that the policy blocks |
| Server processing for heavy jobs (video, PDF to Word layout) | It breaks the guarantee. We wait for browser engines (WebCodecs, MuPDF.js) instead |
| Native desktop and phone apps | The installable web app covers the same need |
| Thousands of thin search pages | Thin pages hurt ranking and trust. A page needs a real preset to exist, such as "Compress PDF to under 1 MB" |
| A general AI chat | It is not a tool. The MCP server and the browser's built-in AI cover assistant use |
