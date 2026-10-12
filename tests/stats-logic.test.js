import test from "node:test";
import assert from "node:assert/strict";
import { EVENT_CEILING, LIKE_LIMIT, WANT_LIMIT, buildEmail, buildIssue, cleanRepo, deliver, healthBody, feedbackBody, feedbackSubject, parseFeedback, canRefetchTools, cleanWeight, dayKey, parseBody, sampleRateFor, sameOrigin, summarize, normalizeSearch, normalizeRef, SEARCH_LIMIT, normalizeCountry, HIDDEN_SEARCHES } from "../worker/logic.js";

const tools = new Set(["pdf/compress", "text/word-counter"]);

test("accepts only known tools and kinds", () => {
  assert.deepEqual(parseBody({ tool: "pdf/compress", kind: "use" }, tools, "event"), { tool: "pdf/compress", kind: "use", weight: 1 });
  assert.deepEqual(parseBody({ tool: "pdf/compress", kind: "success" }, tools, "event"), { tool: "pdf/compress", kind: "success", weight: 1 });
  assert.throws(() => parseBody({ tool: "evil/tool", kind: "use" }, tools, "event"), /unknown tool/);
  assert.throws(() => parseBody({ tool: "pdf/compress", kind: "click" }, tools, "event"), /unknown kind/);
  assert.throws(() => parseBody("nope", tools, "event"), /bad body/);
});

test("visits carry only a referrer name and a device type, cleaned, and no tool", () => {
  assert.deepEqual(parseBody({ ref: "www.google.no", device: "phone", tool: "pdf/compress" }, tools, "visit"), { ref: "Google", device: "phone", weight: 1 });
  assert.deepEqual(parseBody({ device: "fridge" }, tools, "visit"), { ref: "Direct", device: null, weight: 1 });
  assert.deepEqual(parseBody({ ref: "example.org/a?b" }, tools, "visit"), { ref: null, device: null, weight: 1 });
});

test("referrers become source names or bare domains, never paths", () => {
  assert.equal(normalizeRef("news.ycombinator.com"), "Hacker News");
  assert.equal(normalizeRef("t.co"), "X");
  assert.equal(normalizeRef("www.example.org"), "example.org");
  assert.equal(normalizeRef(""), "Direct");
  assert.equal(normalizeRef("example.org/secret?x=1"), null);
  assert.equal(normalizeRef("x".repeat(70) + ".com"), null);
});

test("countries are two-letter codes; Tor and unknown become XX", () => {
  assert.equal(normalizeCountry("NO"), "NO");
  assert.equal(normalizeCountry("T1"), "XX");
  assert.equal(normalizeCountry(undefined), "XX");
});

test("likes need a true/false on", () => {
  assert.deepEqual(parseBody({ tool: "pdf/compress", on: false }, tools, "like"), { tool: "pdf/compress", on: false });
  assert.throws(() => parseBody({ tool: "pdf/compress", on: "yes" }, tools, "like"), /bad like/);
});

test("only same-origin requests may write", () => {
  const req = (origin) => new Request("https://freethetools.com/api/stats/event", { method: "POST", headers: origin ? { Origin: origin } : {} });
  assert.equal(sameOrigin(req("https://freethetools.com")), true);
  assert.equal(sameOrigin(req("https://evil.example")), false);
  assert.equal(sameOrigin(req(null)), false);
});

test("summary never shows negative likes and sorts breakdowns", () => {
  const s = summarize(
    [{ tool: "pdf/compress", views: 10, uses: 4, likes: -1, uses30: 2, successes: 3, errors: 1 }],
    [{ dim: "country", key: "SE", n: 2 }, { dim: "country", key: "NO", n: 5 }, { dim: "device", key: "phone", n: 3 }, { dim: "visit", key: "all", n: 7 }],
  );
  assert.deepEqual(s.tools["pdf/compress"], { views: 10, uses: 4, likes: 0, uses30: 2, successes: 3, errors: 1 });
  assert.equal(s.site.visits30, 7);
  assert.deepEqual(s.site.countries, [["NO", 5], ["SE", 2]]);
  assert.deepEqual(s.site.devices, [["phone", 3]]);
});

test("day keys are UTC dates", () => {
  assert.equal(dayKey(new Date("2026-09-28T23:30:00-05:00")), "2026-09-29");
});

test("bodies with more than 5 keys are rejected", () => {
  const ok = { tool: "pdf/compress", kind: "use", a: 1, b: 2, c: 3 };
  assert.equal(parseBody(ok, tools, "event").kind, "use");
  assert.throws(() => parseBody({ ...ok, d: 4 }, tools, "event"), /too many keys/);
  assert.throws(() => parseBody({ device: "phone", a: 1, b: 2, c: 3, d: 4, e: 5 }, tools, "visit"), /too many keys/);
});

test("sampling rate steps up with the 7-day average of daily visits", () => {
  assert.equal(sampleRateFor(0), 1);
  assert.equal(sampleRateFor(14999), 1);
  assert.equal(sampleRateFor(15000), 5);
  assert.equal(sampleRateFor(39999), 5);
  assert.equal(sampleRateFor(40000), 10);
  assert.equal(sampleRateFor(99999), 10);
  assert.equal(sampleRateFor(100000), 20);
  assert.equal(sampleRateFor(NaN), 1);
  assert.equal(sampleRateFor(undefined), 1);
});

test("a weight counts only when it is a whole number equal to the server rate", () => {
  assert.equal(cleanWeight(5, 5), 5);
  assert.equal(cleanWeight(5, 1), 1);
  assert.equal(cleanWeight(10, 5), 1);
  assert.equal(cleanWeight(2.5, 5), 1);
  assert.equal(cleanWeight("5", 5), 1);
  assert.equal(cleanWeight(0, 1), 1);
  assert.equal(cleanWeight(21, 21), 1);
  assert.equal(cleanWeight(undefined, 5), 1);
  assert.equal(parseBody({ tool: "pdf/compress", kind: "view", weight: 5 }, tools, "event", 5).weight, 5);
  assert.equal(parseBody({ tool: "pdf/compress", kind: "view", weight: 5 }, tools, "event", 1).weight, 1);
  assert.equal(parseBody({ device: "phone", weight: 10 }, tools, "visit", 10).weight, 10);
});

test("the summary carries the sampling rate for the last 7 days", () => {
  assert.deepEqual(summarize([], [], 0).sample, { visits: 1, events: 1 });
  assert.deepEqual(summarize([], [], 7 * 40000).sample, { visits: 10, events: 10 });
});

test("the tool list is fetched again at most once a minute", () => {
  assert.equal(canRefetchTools(1000, 0), false);
  assert.equal(canRefetchTools(59999, 0), false);
  assert.equal(canRefetchTools(60000, 0), true);
});

test("limits are the agreed numbers", () => {
  assert.equal(LIKE_LIMIT, 500);
  assert.equal(EVENT_CEILING, 100000);
});

// ---- "I want this" votes ----

const planned = new Set(["pdf/page-delete", "everyday/zip"]);

test("a want is accepted only for a planned tool, not a built one", () => {
  assert.deepEqual(parseBody({ tool: "pdf/page-delete" }, planned, "want"), { tool: "pdf/page-delete" });
  assert.throws(() => parseBody({ tool: "pdf/compress" }, planned, "want"), /unknown tool/);
  assert.throws(() => parseBody({ tool: 5 }, planned, "want"), /unknown tool/);
  assert.throws(() => parseBody(null, planned, "want"), /bad body/);
  assert.throws(() => parseBody({ tool: "pdf/page-delete", a: 1, b: 2, c: 3, d: 4, e: 5 }, planned, "want"), /too many keys/);
});

test("a planned tool is not a known tool for events and likes", () => {
  assert.throws(() => parseBody({ tool: "pdf/page-delete", kind: "use" }, tools, "event"), /unknown tool/);
  assert.ok(WANT_LIMIT > 0);
});

test("the summary carries want totals by tool", () => {
  const s = summarize([], [], 0, [{ tool: "pdf/page-delete", n: 12 }, { tool: "everyday/zip", n: null }]);
  assert.deepEqual(s.wants, { "pdf/page-delete": 12, "everyday/zip": 0 });
  assert.deepEqual(summarize([]).wants, {});
});

// ---- Suggestions and problem reports ----

const good = { kind: "suggestion", message: "Please add a tool that joins two images side by side.", use: "Paint", tool: "images/join", email: "ada@example.org", website: "" };

test("a good suggestion is cleaned and kept", () => {
  assert.deepEqual(parseFeedback(good), { kind: "suggestion", message: good.message, use: "Paint", tool: "images/join", email: "ada@example.org" });
});

test("optional fields may be missing, and a problem report ignores 'use'", () => {
  assert.deepEqual(parseFeedback({ kind: "problem", message: "The download button does nothing.", use: "x" }), { kind: "problem", message: "The download button does nothing.", use: "", tool: "", email: "" });
});

test("a filled honeypot is dropped as spam, whatever else is in the body", () => {
  assert.deepEqual(parseFeedback({ ...good, website: "http://spam.example" }), { spam: true });
  assert.deepEqual(parseFeedback({ website: "x" }), { spam: true });
});

test("the message must be 10 to 2000 characters", () => {
  assert.throws(() => parseFeedback({ ...good, message: "too short" }), /too short/);
  assert.throws(() => parseFeedback({ ...good, message: "          " }), /too short/);
  assert.equal(parseFeedback({ ...good, message: "x".repeat(2000) }).message.length, 2000);
  assert.throws(() => parseFeedback({ ...good, message: "x".repeat(2001) }), /too long/);
  assert.throws(() => parseFeedback({ ...good, message: 42 }), /bad message/);
});

test("kind, email and field types are checked", () => {
  assert.throws(() => parseFeedback({ ...good, kind: "praise" }), /bad kind/);
  for (const email of ["ada", "ada@", "@example.org", "ada@example", "a b@example.org", "a@b.org, c@d.org", "a@b.org\nBcc: x@y.org", "<a@b.org>"]) {
    assert.throws(() => parseFeedback({ ...good, email }), /bad email/, email);
  }
  assert.equal(parseFeedback({ ...good, email: "" }).email, "");
  assert.throws(() => parseFeedback({ ...good, tool: "x".repeat(101) }), /tool too long/);
  assert.throws(() => parseFeedback({ ...good, use: "x".repeat(301) }), /use too long/);
  assert.throws(() => parseFeedback({ ...good, tool: { a: 1 } }), /bad tool/);
  assert.throws(() => parseFeedback([]), /bad body/);
  assert.throws(() => parseFeedback("hi"), /bad body/);
});

test("line breaks cannot get into a header field", () => {
  const fb = parseFeedback({ ...good, tool: "pdf/merge\r\nBcc: spy@example.org", use: "a\nb" });
  assert.equal(fb.tool, "pdf/merge Bcc: spy@example.org");
  assert.equal(fb.use, "a b");
  const raw = buildEmail(fb, { from: "forms@freethetools.com", to: "hello@freethetools.com", date: new Date(0), id: "x" });
  assert.equal(raw.split("\r\n\r\n")[0].split("\r\n").some((l) => l.startsWith("Bcc:")), false);
});

test("the subject names the tool, or says 'new tool'", () => {
  assert.equal(feedbackSubject({ kind: "suggestion", tool: "" }), "Suggestion: new tool");
  assert.equal(feedbackSubject({ kind: "suggestion", tool: "pdf/page-delete" }), "Suggestion: pdf/page-delete");
  assert.equal(feedbackSubject({ kind: "problem", tool: "pdf/merge" }), "Problem: pdf/merge");
});

test("the email is a plain-text UTF-8 message from the forms address, with a Reply-To only when given", () => {
  const meta = { from: "forms@freethetools.com", to: "hello@freethetools.com", date: new Date(Date.UTC(2026, 9, 10, 12, 0, 0)), id: "abc" };
  const raw = buildEmail(parseFeedback(good), meta);
  const [head, body] = raw.split("\r\n\r\n");
  const lines = head.split("\r\n");
  assert.ok(lines.includes("From: Free the Tools <forms@freethetools.com>"));
  assert.ok(lines.includes("To: hello@freethetools.com"));
  assert.ok(lines.includes("Reply-To: ada@example.org"));
  assert.ok(lines.includes("Subject: Suggestion: images/join"));
  assert.ok(lines.includes("Message-ID: <abc@freethetools.com>"));
  assert.ok(lines.includes("MIME-Version: 1.0"));
  assert.ok(lines.includes("Content-Type: text/plain; charset=UTF-8"));
  assert.ok(lines.includes("Date: Sat, 10 Oct 2026 12:00:00 +0000"));
  assert.ok(body.split("\r\n").every((l) => l.length <= 76));
  const decoded = new TextDecoder().decode(Uint8Array.from(atob(body.replace(/\s/g, "")), (c) => c.charCodeAt(0)));
  assert.equal(decoded, feedbackBody(parseFeedback(good)));
  assert.match(decoded, /What should it do\?\nPlease add a tool/);
  assert.match(decoded, /What do you use today\?\nPaint/);
  const noReply = buildEmail(parseFeedback({ ...good, email: "" }), meta);
  assert.equal(/^Reply-To:/m.test(noReply), false);
});

test("non-ASCII text survives in the body and in the subject", () => {
  const meta = { from: "forms@freethetools.com", to: "hello@freethetools.com", date: new Date(0), id: "z" };
  const fb = parseFeedback({ kind: "problem", message: "Æøå ø fungerer ikke: 日本語 \u{1F600}", tool: "pdf/fløy" });
  const raw = buildEmail(fb, meta);
  const [head, body] = raw.split("\r\n\r\n");
  const subject = head.split("\r\n").find((l) => l.startsWith("Subject: "));
  const m = subject.match(/^Subject: =\?UTF-8\?B\?(.+)\?=$/);
  assert.ok(m);
  assert.equal(new TextDecoder().decode(Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0))), "Problem: pdf/fløy");
  const decoded = new TextDecoder().decode(Uint8Array.from(atob(body.replace(/\s/g, "")), (c) => c.charCodeAt(0)));
  assert.match(decoded, /Æøå ø fungerer ikke: 日本語 \u{1F600}/u);
  assert.match(decoded, /What went wrong\?/);
  assert.equal(/What do you use today/.test(decoded), false);
});

test("search terms: short plain words only", () => {
  assert.equal(normalizeSearch("heic to pdf"), "heic to pdf");
  assert.equal(normalizeSearch("сжать фото"), "сжать фото");
  assert.equal(normalizeSearch("pdf beskjæring"), "pdf beskjæring");
  assert.equal(normalizeSearch("  PDF   Beskjæring "), "pdf beskjæring");
  assert.equal(normalizeSearch("don't c++ & rock-n-roll"), "don't c++ & rock-n-roll");
  for (const bad of ["john@example.com", "call 12345678", "invoice.pdf", "https://x.y", "a", " a ", "", "a/b", "a\b", "x:y", "emoji 😀", "+&", "x".repeat(41), "one two three four five six seven"]) {
    assert.equal(normalizeSearch(bad), null, bad);
  }
  assert.equal(normalizeSearch("one two three four five six"), "one two three four five six");
  assert.equal(normalizeSearch("x".repeat(40)), "x".repeat(40));
  assert.equal(normalizeSearch(42), null);
  assert.equal(normalizeSearch(undefined), null);
});

test("search bodies keep only the term and the sampling weight", () => {
  assert.deepEqual(parseBody({ term: "Heic To PDF" }, null, "search"), { term: "heic to pdf", weight: 1 });
  assert.deepEqual(parseBody({ term: "heic", weight: 5 }, null, "search", 5), { term: "heic", weight: 5 });
  assert.throws(() => parseBody({ term: "a@b.c" }, null, "search"), /bad term/);
  assert.throws(() => parseBody({}, null, "search"), /bad term/);
});

test("a search term is public only with 5 searches on 3 different days", () => {
  const rows = [
    { key: "heic to pdf", n: 9, days: 3 },
    { key: "few days", n: 50, days: 2 },
    { key: "too few", n: 4, days: 4 },
    { key: "exactly", n: 5, days: 3 },
    { key: "a@b.c", n: 99, days: 9 },
    { key: "fax 12", n: 99, days: 9 },
  ];
  const { searches } = summarize([], [], 0, [], rows).site;
  assert.deepEqual(searches, [["heic to pdf", 9], ["exactly", 5]]);
  const many = Array.from({ length: 30 }, (_, i) => ({ key: `word${"abcdefghijklmnopqrstuvwxyzabcd"[i]}`.replace(/\d/g, ""), n: 10 + i, days: 5 }));
  assert.equal(summarize([], [], 0, [], many).site.searches.length, 20);
  assert.deepEqual(summarize([], []).site.searches, []);
});

test("the daily cap for one term is 200", () => {
  assert.equal(SEARCH_LIMIT, 200);
});

test("AI assistants get names; an empty referrer stays Direct", () => {
  assert.equal(normalizeRef("chatgpt.com"), "ChatGPT");
  assert.equal(normalizeRef("chat.openai.com"), "ChatGPT");
  assert.equal(normalizeRef("www.perplexity.ai"), "Perplexity");
  assert.equal(normalizeRef("claude.ai"), "Claude");
  assert.equal(normalizeRef("gemini.google.com"), "Gemini");
  assert.equal(normalizeRef("www.google.com"), "Google");
  assert.equal(normalizeRef("copilot.microsoft.com"), "Copilot");
  assert.equal(normalizeRef("https://chatgpt.com/x"), null);
});

test("a phrase on the hide list never reaches the public list", () => {
  HIDDEN_SEARCHES.add("planted phrase");
  try {
    const s = summarize([], [], 0, [], [{ key: "planted phrase", n: 50, days: 5 }, { key: "heic to pdf", n: 9, days: 4 }]);
    assert.deepEqual(s.site.searches, [["heic to pdf", 9]]);
  } finally {
    HIDDEN_SEARCHES.delete("planted phrase");
  }
});

// ---- GitHub issue and delivery ----

test("the issue has a one-line title, labels, and no sender identity", () => {
  const fb = parseFeedback({ ...good, email: "ada@example.org" });
  const issue = buildIssue(fb);
  assert.match(issue.title, /^Suggestion: /);
  assert.ok(!issue.title.includes("\n"));
  assert.deepEqual(issue.labels, ["suggestion", "needs triage"]);
  assert.match(issue.body, /\*\*Kind:\*\* suggestion/);
  assert.match(issue.body, /What do you use today\?/);
  const all = JSON.stringify(issue);
  assert.equal(all.includes("ada@example.org"), false);
  assert.equal(all.includes("example.org"), false);
  const problem = buildIssue(parseFeedback({ kind: "problem", message: "The merge button does nothing", tool: "pdf/merge", use: "x" }));
  assert.match(problem.title, /^Problem: /);
  assert.deepEqual(problem.labels, ["problem", "needs triage"]);
  assert.equal(problem.body.includes("What do you use today?"), false);
});

test("backticks cannot close the fence or a code span", () => {
  const fb = parseFeedback({ kind: "suggestion", message: "before ``` after\n```\n# heading `x`", tool: "a`b", use: "`c`" });
  const { body, title } = buildIssue(fb);
  assert.equal(title.includes("`"), false);
  const ticks = body.split("\n").filter((l) => l.includes("```"));
  assert.deepEqual(ticks, ["```text", "```"]);
  assert.equal(body.includes("a`b"), false);
});

test("mentions and images in the message stay inside the fence; the title cannot mention", () => {
  const msg = "thanks @octocat and @sapience-design/team ![x](https://evil.example/p.png) [a](https://evil.example)";
  const { title, body } = buildIssue(parseFeedback({ kind: "suggestion", message: msg }));
  assert.equal(/@(?!​)/.test(title), false);
  const [before, rest] = body.split("```text\n");
  const [inside, after] = rest.split("\n```\n");
  assert.ok(inside.includes("@octocat") && inside.includes("![x](https://evil.example/p.png)"));
  assert.equal(/[@!\[]/.test(before + after), false);
});

test("a long message gives a title of at most 60 characters of text, and a bounded body", () => {
  const long = "word ".repeat(380);
  const { title, body } = buildIssue(parseFeedback({ kind: "suggestion", message: long }));
  assert.ok([..."Suggestion: "].length + 60 >= [...title].length);
  assert.ok(title.length <= "Suggestion: ".length + 60);
  assert.ok(body.length < 2600);
  const emoji = buildIssue(parseFeedback({ kind: "suggestion", message: "\u{1F600}".repeat(100) }));
  assert.equal([...emoji.title.slice("Suggestion: ".length)].length, 60);
});

test("new lines in the message never reach the title", () => {
  const { title, body } = buildIssue(parseFeedback({ kind: "problem", message: "line one\n\nline two\r\nline three" }));
  assert.equal(title, "Problem: line one line two line three");
  assert.ok(body.includes("line one\n\nline two\nline three"));
});

test("the repository name must be owner/name", () => {
  assert.equal(cleanRepo("sapience-design/freethetools-inbox"), "sapience-design/freethetools-inbox");
  for (const bad of ["", undefined, "a", "a/b/c", "../x", "a/b?x=1", "a b/c"]) assert.equal(cleanRepo(bad), "");
});

test("delivery: 204 when one channel works, 502 only when all fail, 503 when none is set up", async () => {
  const ok = { name: "email", send: async () => {} };
  const bad = (name) => ({ name, send: async () => { throw new Error("GitHub answered 401"); } });
  assert.deepEqual(await deliver([]), { status: 503, failed: [] });
  assert.deepEqual(await deliver([ok, ok]), { status: 204, failed: [] });
  const one = await deliver([ok, bad("github")]);
  assert.equal(one.status, 204);
  assert.deepEqual(one.failed, [{ name: "github", reason: "GitHub answered 401" }]);
  assert.equal((await deliver([bad("email"), ok])).status, 204);
  const both = await deliver([bad("email"), bad("github")]);
  assert.equal(both.status, 502);
  assert.deepEqual(both.failed.map((f) => f.name), ["email", "github"]);
  assert.equal((await deliver([bad("email")])).status, 502);
  // a channel that throws synchronously is a failure too
  assert.equal((await deliver([{ name: "email", send: () => { throw new Error("x"); } }])).status, 502);
});

test("the health body counts failures per channel and is zero when empty", () => {
  assert.deepEqual(healthBody([]), { feedbackFailures: { email: 0, github: 0 } });
  assert.deepEqual(healthBody(), { feedbackFailures: { email: 0, github: 0 } });
  assert.deepEqual(healthBody([{ key: "feedback-github", n: 3 }, { key: "other", n: 9 }]), { feedbackFailures: { email: 0, github: 3 } });
});

test("failure rows never show up in the public summary", () => {
  const s = summarize([], [{ dim: "fail", key: "feedback-email", n: 4 }, { dim: "visit", key: "all", n: 2 }], 0);
  assert.equal(JSON.stringify(s).includes("feedback"), false);
  assert.equal(s.site.visits30, 2);
});
