> Researched 2026-09-27 to prioritise which tools to build. Reddit could not be reached by the research tools; evidence is from Hacker News, GitHub and AlternativeTo.

# Most-wanted free/private browser tools — research for Free the Tools

Method note up front: Reddit itself (reddit.com) is **not reachable** by either the web-search or
page-fetch tool in this environment — every reddit.com fetch errored ("unable to fetch") and every
search restricted to reddit.com was rejected outright. General web search on Reddit-flavored queries
therefore returned **SEO content-farm sites** (WildandFree Tools, BrowserStay, ConvertPrivately,
ImagePDF.Tools, EdgeDocs, PDFLince, Hexye, LocallyTools, FixMyPDF, ZeroUploadPDF, QuickTools.one,
PortImg, PDFOmni, and similar) — these are near-identical templated clone sites *asserting* "what
Reddit wants" as marketing copy, not actual threads. I did not treat any of their claims as demand
evidence; they're listed in the "found but excluded" section as noise, not signal. Real, checkable
demand signal came from three places instead: Hacker News (via the public Algolia API — exact
points/comments/dates), GitHub (via the REST API — exact stars and issue reaction counts), and
AlternativeTo (via direct page fetch — exact like counts). Where a number below is from a search
engine's own summary rather than a primary source I fetched myself, it is marked **unverified**.

## 1. Ranked demand list (top ~25)

| # | Tool | Evidence | Runs fully in browser? | Suggested library (licence) |
|---|------|----------|------------------------|------------------------------|
| 1 | Merge / split / rotate PDF | Stirling-PDF (MIT core) 93,121 GitHub stars, 9,796 forks — the single largest signal in this whole survey. omni-tools issue "for the love of God, turn this into an MCP" +5 reactions shows even power users want it embedded elsewhere. AlternativeTo iLovePDF page: Stirling PDF is AlternativeTo's own top pick, 67 likes. | Yes — pdf-lib/pdf.js do this client-side; Stirling-PDF's own web UI is server-side Java but the operations themselves are trivially client-portable. | pdf-lib (MIT) or pdf.js (Apache-2.0) |
| 2 | PDF form filling / editing form fields | Stirling-PDF issue #320 "[Request] Add form entries to PDF" — **+57 reactions, the single most-upvoted open issue in the whole repo.** HN BreezePDF thread (97 pts/46 comments): top requested feature was "doesn't edit PDF text, just adds more" / form + font support. | Partly — AcroForm filling is doable client-side; free-text PDF editing (reflowing existing text) is genuinely hard in-browser and most "editors" fake it by overlaying new text boxes. | pdf-lib (MIT) for AcroForm fields; pdf.js (Apache-2.0) for rendering |
| 3 | Images ↔ PDF (both directions) | omni-tools README ships this as a core category; Stirling-PDF ships it; HN "Convert Large CSV/XLSX to JSON or XML in Browser" (41 pts/13 comments) shows general appetite for in-browser format conversion; DEV.to clone-site volume (dozens of "I built a free image-to-PDF converter" posts) indicates many builders keep re-solving this, i.e. steady low-effort demand. | Yes | pdf-lib (MIT) + pdf.js (Apache-2.0) |
| 4 | Compress / resize image | it-tools does not include this, but omni-tools and Stirling-PDF both do; HN "Squeezes – private local-first bulk image compressor" and "ToolKuai – privacy-first, 100% client-side media tools" (8 pts/5 comments) are recent (2026) Show HNs specifically pitching *local* image compression as the differentiator vs. TinyPNG-style uploaders. | Yes | browser-image-compression (MIT) or squoosh's codecs (Apache-2.0) |
| 5 | HEIC → JPG/PNG | omni-tools open issue #201 "Feature Request: Add Image Tool for HEIC Conversion" (+2, still open = unmet in a 10k-star project); multiple 2025–2026 Show HNs dedicated solely to this ("LocalDrop – Private, client-side HEIC converter", "HEIC to JPG converter – no uploads"). Apple's format keeps generating one-off tool requests. | Yes | heic2any (MIT, wraps libheif via WASM) |
| 6 | Unit converter | HN "Show HN: I created Units Converter with 5000 units across 78 categories" — **147 points, 130 comments (2023)**, by far the highest engagement of any single-purpose tool found in this whole search. omni-tools ships a general converter category too. | Yes | convert-units (MIT) |
| 7 | JSON formatter / viewer | it-tools (40,699 stars) ships json-viewer as one of its ~85 tools — inclusion in the most-starred pure-utility collection found is itself the demand signal, since it-tools' own popularity is driven by exactly these small tools. | Yes | Native `JSON.parse`/custom pretty-printer; no dependency needed, or jsonrepair (MIT) for malformed input |
| 8 | CSV ↔ JSON | it-tools ships json-to-csv; HN "Npm module that makes easy to convert JSON to CSV" (64 pts/63 comments) and "Convert Large CSV/XLSX to JSON or XML in Browser" (41 pts/13 comments) — two separate, well-received Show HNs on this exact conversion. | Yes | PapaParse (MIT) |
| 9 | Base64 encode/decode (text + file) | it-tools ships *two* separate Base64 tools (string and file converter) — rare for a curated collection to bother splitting these, implying real distinct usage. | Yes | Native `btoa`/`atob` + FileReader; no dependency needed |
| 10 | Hash generator (MD5/SHA/etc.) | it-tools ships hash-text and hmac-generator as separate tools; DevToys (32,028 stars) ships "Hash & Checksum Generator" as one of its default 30 tools. | Yes | js-sha256 / crypto-js (MIT) or native SubtleCrypto |
| 11 | UUID generator | it-tools ships uuid-generator; independent recurring HN submissions since 2015 ("UUID Generator" 9 pts, "Yet another online UUID generator" 6 pts, "Sequential UUID Generators" 6 pts) show this gets rebuilt and resubmitted every couple of years — a "boring but always wanted" utility. | Yes | uuid (MIT) |
| 12 | QR code generator | AlternativeTo "QR Code Generator" category is 8 pages deep of listed tools (unusually long category = high supply chasing high demand); it-tools ships both qr-code-generator and wifi-qr-code-generator as separate tools. | Yes | qrcode (MIT) |
| 13 | Text diff / compare | it-tools ships text-diff; HN "Show HN: TextCompare – Local-first diff tools for text, files, and code" (2026) is a recent dedicated launch; "dashy.io" thread (7 pts/10 comments) also cites diff as a wanted feature. | Yes | jsdiff (BSD-3-Clause) or diff-match-patch (Apache-2.0) |
| 14 | Word / character counter | it-tools ships text-statistics; DevToys ships "Text Analyzer & Utilities." Lower HN engagement than most (1 pt on a dedicated Show HN) — this is a "must-have for completeness" tool rather than a growth driver. | Yes | No dependency needed — trivial to implement |
| 15 | Case converter | it-tools ships case-converter; omni-tools README lists "Case Converters" explicitly as a category. HN engagement for dedicated launches is low (1–2 pts), consistent with #14: expected-to-exist utility, not a discovery driver. | Yes | No dependency needed |
| 16 | Remove photo metadata / EXIF / GPS | omni-tools open issue #301 (**+9 reactions**) — "README claims 'nothing ever leaves your device', but PDF tool sends analytics & document fingerprints to third parties" — this is the strongest *trust* signal in the whole survey: users actively check whether "local-only" claims are true and file bug reports when they aren't. HN "Kuro-Nuri – Browser-based image redaction using WASM" (4 pts) also touches this. | Yes | exifr (MIT) for reading/stripping EXIF |
| 17 | Time zone converter | omni-tools README lists "Time Zone Converters" as a shipped category; HN "Timezone converter that tells you if your meeting time sucks" (6 pts) is a recent dedicated launch. | Yes | Luxon (MIT) or native Intl.DateTimeFormat |
| 18 | General file converter (images/docs/audio, one box) | VERT.sh: AlternativeTo's top-liked TinyWow *and* CloudConvert alternative (26 likes on both pages) specifically because it "processes files on your device instead of the cloud… ad-free, and open source" — and it is itself AGPL-3.0. This is the clearest single validated proof that "local file converter" beats "upload-based converter" in a head-to-head community vote. | Yes (that's VERT.sh's whole pitch) | ffmpeg.wasm (LGPL/GPL depending on build) for audio/video; browser-native codecs for images |
| 19 | Password / passphrase generator | DevToys ships "Password Generator" as a default tool; it-tools ships token-generator and bip39-generator (crypto-adjacent generators). Moderate, steady category rather than a spike. | Yes | No dependency needed (crypto.getRandomValues) |
| 20 | Regex tester | it-tools ships regex-tester and regex-memo as two separate tools; DevToys ships "RegEx Tester." Consistently included in every dev-tool collection surveyed. | Yes | Native RegExp; no dependency needed |
| 21 | Markdown ↔ HTML preview | it-tools ships markdown-to-html and html-wysiwyg-editor. | Yes | marked (MIT) or markdown-it (MIT) |
| 22 | JWT decoder | it-tools ships jwt-parser as a standalone tool — decoding/inspecting JWTs (not just Base64) is common enough to warrant its own entry in a 85-tool collection. | Yes | jwt-decode (MIT) |
| 23 | IBAN / phone number validator-formatter | it-tools ships both iban-validator-and-parser and phone-parser-and-formatter as separate tools — niche but recurring "is this a valid X" need. | Yes | libphonenumber-js (MIT) |
| 24 | Crontab generator / explainer | it-tools ships crontab-generator as a standalone tool; sysadmin-adjacent, recurring "what does this cron expression do" need. | Yes | cronstrue (MIT) |
| 25 | Color converter / picker | it-tools ships color-converter as a standalone tool; DevToys ships "Color Blindness Simulator." | Yes | colord (MIT) |

## 2. Planned tools: what the evidence supports vs. doesn't

**Strongly supported (build with confidence):**
- Merge/Split/Rotate PDF (#1) — the single strongest signal found (Stirling-PDF's 93k stars).
- Images to PDF / PDF to images (#3)
- Compress/resize/convert images (#4)
- HEIC to JPG (#5) — open, unmet issue in a 10k-star project is a concrete gap.
- Word counter, Text diff, Case converter, CSV to JSON, JSON formatter, Base64, Hash generator,
  QR code maker, UUID generator, Unit converter, Time zone converter — **every one of these
  appears, individually, as its own tool inside it-tools (40.7k stars) and/or omni-tools
  (10.3k stars).** That two independently-built, well-starred open-source projects converged on
  the same tool list as your plan is the strongest form of validation available short of your own
  traffic data.
- Remove photo location (#16) — the omni-tools trust-violation issue (+9 reactions) shows this
  isn't just a feature, it's a *trust claim* people verify; ship it with a visible "check the
  network tab / it's open source" proof point, not just the feature.

**Weakly supported / evidence is thin either way:**
- Compress PDF (your only *live* tool) has no dedicated standalone evidence in this search beyond
  being subsumed into Stirling-PDF/omni-tools' general PDF suites — it's clearly wanted as *part of*
  a PDF toolkit, but I found no dedicated "compress PDF" Show HN or top-reactions issue the way PDF
  forms (#2) or merge/split (#1) have. Not a reason to doubt it — just no independent confirmation
  found today.

**Not contradicted, just not independently evidenced:**
- None of the planned tools showed negative or contradicting evidence (e.g., "nobody wants this").
  The gap is entirely in unit-of-analysis: some planned tools (word counter, case converter) show
  low HN engagement on dedicated launches, which is expected — they're "expected to exist" utilities
  that people don't post about, they just use. Low Show-HN points for these should not be read as
  low demand; it-tools including them as individual tools among only ~85 total is the better signal.

## 3. Tools NOT on your current list that the evidence says to add

1. **PDF form filling (AcroForm)** — Stirling-PDF's #320, at +57 reactions, is the single
   highest-signal individual feature request found in this entire research pass. Worth a dedicated
   "Fill PDF Form" tool, not just bundled into a generic editor.
2. **General multi-format file converter (VERT.sh-style: any-image ↔ any-image, doc ↔ doc)** —
   validated head-to-head against TinyWow and CloudConvert on AlternativeTo specifically *because*
   it runs locally; this is closer to your site's overall thesis than any single narrow tool.
3. **JWT decoder** — small, recurring dev need (it-tools ships it standalone); cheap to build,
   clean audience overlap with your Base64/hash-generator users.
4. **Regex tester** — same logic as #3; appears standalone in both it-tools and DevToys.
5. **Password/passphrase generator** — trivial to build, appears as a default tool in DevToys and
   as multiple related generators in it-tools; natural companion to hash generator/UUID generator.
6. **Markdown ↔ HTML converter/previewer** — appears in it-tools; low effort, complements a
   text-tools cluster (word counter, case converter, diff).

## 4. Found but excluded (nothing silently dropped)

- **The entire "privacy-first PDF/image toolkit" clone-site farm** (WildandFree Tools, BrowserStay,
  ConvertPrivately, ImagePDF.Tools, EdgeDocs, PDFLince, Hexye PDF Tools, LocallyTools, FixMyPDF,
  ZeroUploadPDF, QuickTools.one, PortImg, PDFOmni, PDFImageTools, ToPDF, imagePDF clones, "Offline
  File Converter") — excluded as *evidence*, not as competitors. These are near-identical templated
  marketing sites that assert "what people want" without a checkable source; several appear to share
  the same template/generator. I did not use any of their claims in the ranked list above.
- **PDF form-filling with an AI model, client-side tool-calling** (HN, 60 pts/29 comments,
  "Filling PDF forms with AI using client-side tool calling") — excluded because it requires an LLM
  API call (even if "client-side tool calling," the model itself is remote), contradicting your
  no-server/no-account premise.
- **"Web & Youtube Highlighter + AI Summary" and "ChecklistFox: AI checklist maker for PDFs"**
  (Product Hunt) — excluded, AI-generated content, not a mechanical browser tool.
- **PDF Reflow with local AI model** (HN, 6 pts) — excluded, needs a local AI model download
  (large, heavy runtime), not "everyday small tool" scope.
- **Video trimmer/reverser** (seen in omni-tools' own category list) — excluded from this ranking:
  video codecs in-browser via ffmpeg.wasm are heavy (multi-MB WASM payload, slow on mobile) and a
  meaningfully bigger engineering lift than every other tool here; flagging as a possible *future*
  category, not a "build next" one.
- **Native desktop app requests** (Stirling-PDF #3679 "Native desktop experience," #5354
  "Android/iOS Mobile Apps") — excluded, out of scope for a browser-only site by definition.
- **Self-host/infra requests** (Stirling-PDF #153 Flatpak, #4576 CPU-usage bug, #1516 Docker
  rootless; it-tools #602 Docker persistence, #823 reverse-proxy BASE_URL; omni-tools #198
  BASE_URL, #130 Authentication, #179 Docker rework) — excluded, these are self-hosting/ops
  concerns for people running the *server* version of these tools, irrelevant to a hosted
  browser-only site with no accounts.
- **Chinese-language support requests** (it-tools #743, #569) — excluded from the tool list (it's
  an i18n need, not a new tool), but worth noting as a low-cost localization win if you ever
  measure non-English traffic.
- **"Is this project dead?" / maintenance-anxiety issues** (it-tools #1635) — excluded, not a tool
  request; noted only as a reminder that abandonment is itself a competitive opening.
- **SSH key pair generation, IPv6 calculator, DNS/SSL/webpage tools** (it-tools feature requests,
  +8/+6/+6 reactions) — excluded as too networking/sysadmin-specialized for "everyday" tools per
  your site's stated scope, though they are real, evidenced demand within that dev-tool niche.
- **Financial tracker** (omni-tools #241, 0 reactions) — excluded, unrelated single-user request
  with no support from others.
- **"Turn this into an MCP" request** (omni-tools #177, +5) — excluded, this is an AI-agent
  integration request (expose tools to LLM agents via Model Context Protocol), not an end-user tool.

## 5. Sources searched and what each yielded

- **Reddit** (r/software, r/privacy, r/degoogle, r/opensource, r/selfhosted, r/webdev,
  r/productivity, r/techsupport, r/sysadmin, r/Teachers, r/smallbusiness, r/InternetIsBeautiful):
  **could not be searched directly** — reddit.com is blocked to both the search and fetch tools in
  this environment (fetch returns "unable to fetch," and search with `allowed_domains: ["reddit.com"]`
  is rejected outright as inaccessible to the crawler). General web searches phrased around these
  subreddits returned SEO clone sites, not real threads (see §4). This is a real gap in this report,
  not a null result — treat everything Reddit-flavored above as unverified/absent.
- **Hacker News** (via the public Algolia search API, `hn.algolia.com/api/v1/search`, queried
  directly — exact points/comments/dates, not summarized): yielded the strongest primary-source
  data in this report — the Units Converter (147 pts), BreezePDF (97 pts), PDF-forms-with-AI (60
  pts), JSON/CSV conversion threads (64 and 41 pts), and a long tail of low-traction (1–15 pt)
  "I built N tools" launches showing the space is saturated with supply at the low end. Also
  confirmed multiple recent (2025–2026) Show HNs specifically pitching HEIC conversion and image
  compression as *local/private* differentiators.
- **Product Hunt**: searched directly (producthunt.com/search) — low relevance, no PDF/image
  browser-tool listings with visible upvote counts; not a useful channel for this niche today.
- **AlternativeTo** (fetched directly: iLovePDF, CloudConvert, TinyWow pages): yielded exact like
  counts. Key finding: **Stirling PDF is AlternativeTo's own top-ranked iLovePDF alternative**
  (67 likes) and **VERT.sh is the top-ranked alternative to both TinyWow and CloudConvert**
  (26 likes each), specifically credited for local/no-upload processing and being open source
  (AGPL-3.0).
- **GitHub** (via the REST API, `api.github.com`, queried directly for stars/forks/license and
  `search/issues?sort=reactions` for feature-request ranking): yielded exact, verifiable numbers —
  Stirling-PDF 93,121 stars (MIT core; issue #320 "add form entries to PDF" +57 reactions, the top
  single signal in this report); it-tools 40,699 stars (GPL-3.0; full tool-directory listing
  pulled directly, confirming ~11 of your planned tools exist there as standalone entries);
  omni-tools 10,251 stars (MIT; issue #301 "sends analytics despite local-only claim" +9 reactions
  — a trust signal); DevToys 32,028 stars; BentoPDF (alam00000/bentopdf) 15,757 stars (AGPL-3.0).
- **Google Trends / SimilarWeb / Semrush keyword-volume data**: **not obtained.** I could not fetch
  trends.google.com or any keyword-volume report directly, and I am deliberately not repeating
  the "quoted in an article" numbers that turned up in generic search summaries, because I could
  not trace them to a checkable primary source. Mark any search-volume claim you see elsewhere for
  this space as unverified until sourced directly.

## Licence compatibility note

All suggested libraries above (MIT, Apache-2.0, BSD-3-Clause, ISC-style, LGPL/GPL) are compatible
with an AGPL-3.0 project per your stated list. One caveat: **ffmpeg.wasm** ships under LGPL or GPL
depending on which build/codecs you include — fine under AGPL-3.0, but check which specific build
(there are GPL-only codec variants) before shipping if you ever add the video tool flagged in §4.
