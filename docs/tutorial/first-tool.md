# Tutorial: build your first tool

In about 30 minutes you'll build a **Line Sorter**, see it on your own copy of the site, test it, and open a pull request.

## 1. Get the code running

Fork [sapience-design/freethetools](https://github.com/sapience-design/freethetools) on GitHub, then:

```sh
git clone https://github.com/<you>/freethetools.git
cd freethetools
npm install
npm run dev
```

Open http://localhost:4321. You're looking at the real site, running on your machine.

## 2. Create the tool

In a second terminal:

```sh
git switch -c feat/line-sorter
npm run new-tool -- text line-sorter "Line Sorter" "Transform"
```

This creates `tools/text/line-sorter/` from the template. Open http://localhost:4321/text/line-sorter/ and you'll see a working example tool that upper-cases text.

## 3. Write the logic

Replace `tools/text/line-sorter/core.js`:

```js
// Sorts the lines of a text, A to Z or Z to A. No page code, so it can be tested on its own.
export function run(text, descending = false) {
  if (typeof text !== "string") throw new TypeError("Expected text");
  const lines = text.split(/\r?\n/u);
  lines.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true }));
  if (descending) lines.reverse();
  return lines.join("\n");
}
```

## 4. Test it

Replace `tools/text/line-sorter/tests/core.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { run } from "../core.js";

test("sorts lines from A to Z", () => {
  assert.equal(run("pear\napple\nfig"), "apple\nfig\npear");
});

test("sorts from Z to A on request", () => {
  assert.equal(run("pear\napple\nfig", true), "pear\nfig\napple");
});

test("puts numbers in number order", () => {
  assert.equal(run("item 10\nitem 2"), "item 2\nitem 10");
});

test("rejects things that are not text", () => {
  assert.throws(() => run(42), TypeError);
});
```

Run `npm test`. All four pass.

## 5. Build the interface

In `Tool.astro`, keep the block between the two `---` lines at the top. Replace everything below it with this. It adds a "Z to A" checkbox and shows the sorted lines:

```astro
<section class="tool" aria-label="Line Sorter">
  <Step n={1} title="Type or paste your lines">
    <label class="field"><span class="sr-only">Your lines</span><textarea id="line-sorter-in" rows="6" placeholder="One item per line">pear
apple
fig</textarea></label>
  </Step>
  <Step n={2} title="Choose the order">
    <label><input type="checkbox" id="line-sorter-desc" /> Z to A</label>
  </Step>
  <Step n={3} title="Copy the result">
    <output class="out-box" id="line-sorter-out" for="line-sorter-in line-sorter-desc"></output>
    <button class="btn run" id="line-sorter-copy" type="button"><Icon name="copy" /><span id="line-sorter-copy-label">Copy</span></button>
  </Step>
</section>

<script>
  import { run } from "./core.js";
  const input = document.getElementById("line-sorter-in") as HTMLTextAreaElement;
  const desc = document.getElementById("line-sorter-desc") as HTMLInputElement;
  const output = document.getElementById("line-sorter-out")!;
  const label = document.getElementById("line-sorter-copy-label")!;
  const update = () => (output.textContent = run(input.value, desc.checked));
  input.addEventListener("input", update);
  desc.addEventListener("change", update);
  document.getElementById("line-sorter-copy")!.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(output.textContent ?? ""); label.textContent = "Copied"; } catch { label.textContent = "Select the text to copy"; }
    setTimeout(() => (label.textContent = "Copy"), 1600);
  });
  update();
</script>
```

Keep the `line-sorter-` prefix on every id; the build fails on duplicate ids. The template lays the tool out as numbered steps (`src/components/Step.astro`); for a tool that takes files, copy the pattern in `tools/pdf/merge/Tool.astro`.

## 6. Describe it

Fill in the TODOs in `tool.json`. Write the `task` as the job in plain words ("Sort lines"): it is the page heading and the name in lists. Pick an `icon` from [Phosphor](https://phosphoricons.com/). Write the `seoTitle` in the words people type into a search engine ("Sort lines online"), and keep `description` between 50 and 160 characters. Put your name and GitHub username under `authors`. The [reference](../reference/tool-json.md) explains every field.

### Let AI agents use it (optional)

Add `agent.js` next to `core.js`, so AI assistants can sort lines with your tool instead of installing something:

```js
import { defineTools } from "../../../src/agent/contract.js";
import { run } from "./core.js";

export default defineTools({
  name: "sort_lines",
  title: "Line Sorter",
  description: "Sort the lines of a text from A to Z or Z to A. Runs on this device; nothing is uploaded.",
  input: {
    type: "object",
    properties: {
      text: { type: "string", description: "The text, with one item per line." },
      descending: { type: "boolean", description: "Sort from Z to A. The default is A to Z." },
    },
    required: ["text"],
    additionalProperties: false,
  },
  example: { text: "pear\napple\nfig" },
  run: ({ text, descending }) => {
    const sorted = run(text, descending === true);
    return { summary: `${sorted.split("\n").length} lines sorted.`, data: { text: sorted } };
  },
});
```

`npm test` checks the definition and runs the example.

## 7. Check everything

```sh
npm run check
```

This builds the site, runs your tests, checks every page, and runs the browser tests. The browser tests fail if any page contacts another website, so they also prove your tool keeps its promise.

## 8. Open the pull request

```sh
git add tools/text/line-sorter
git commit -s -m "feat(text): add line sorter"
git push -u origin feat/line-sorter
```

The `-s` adds the sign-off the project requires. Open the pull request on GitHub and fill in the template. A maintainer will review it, and once it's merged your tool goes live on freethetools.com with your name on it.
