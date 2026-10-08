# Tutorial: build your first tool

In about 30 minutes you'll build a **Word Counter**, see it on your own copy of the site, test it, and open a pull request.

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
git switch -c feat/word-counter
npm run new-tool -- text word-counter "Word Counter" "Count & Compare"
```

This creates `tools/text/word-counter/` from the template. Open http://localhost:4321/text/word-counter/ and you'll see a working example tool that upper-cases text. Word Counter is no longer listed as "Not built yet" on the Text tools page.

## 3. Write the logic

Replace `tools/text/word-counter/core.js`:

```js
// Counts words, characters and reading time. No page code, so it can be tested on its own.
export function run(text) {
  if (typeof text !== "string") throw new TypeError("Expected text");
  const words = text.trim() ? text.trim().split(/\s+/u).length : 0;
  return { words, characters: [...text].length, minutes: Math.max(1, Math.round(words / 230)) };
}
```

## 4. Test it

Replace `tools/text/word-counter/tests/core.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { run } from "../core.js";

test("counts words separated by any whitespace", () => {
  assert.equal(run("free  the\ntools").words, 3);
});

test("empty text has no words", () => {
  assert.equal(run("   ").words, 0);
});

test("counts emoji as one character each", () => {
  assert.equal(run("👍👍").characters, 2);
});
```

Run `npm test`. All three pass.

## 5. Build the interface

In `Tool.astro`, change the script so the output shows the counts:

```astro
<script>
  import { run } from "./core.js";
  const input = document.getElementById("word-counter-in") as HTMLTextAreaElement;
  const output = document.getElementById("word-counter-out")!;
  const update = () => {
    const r = run(input.value);
    output.textContent = `${r.words} words · ${r.characters} characters · about ${r.minutes} min read`;
  };
  input.addEventListener("input", update);
  update();
</script>
```

Keep the `word-counter-` prefix on every id; the build fails on duplicate ids. The template lays the tool out as numbered steps (`src/components/Step.astro`); for a tool that takes files, copy the pattern in `tools/pdf/merge/Tool.astro`.

## 6. Describe it

Fill in the TODOs in `tool.json`. Write the `task` as the job in plain words ("Count words"): it is the page heading and the name in lists. Pick an `icon` from [Phosphor](https://phosphoricons.com/). Write the `seoTitle` in the words people type into a search engine ("Word counter online"), and keep `description` between 50 and 160 characters. Put your name and GitHub username under `authors`. The [reference](../reference/tool-json.md) explains every field.

## 7. Check everything

```sh
npm run check
```

This builds the site, runs your tests, checks every page, and runs the browser tests. The browser tests fail if any page contacts another website, so they also prove your tool keeps its promise.

## 8. Open the pull request

```sh
git add tools/text/word-counter
git commit -s -m "feat(text): add word counter"
git push -u origin feat/word-counter
```

The `-s` adds the sign-off the project requires. Open the pull request on GitHub and fill in the template. A maintainer will review it, and once it's merged your tool goes live on freethetools.com with your name on it.
