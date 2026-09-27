# How to vendor a library

Tools can't load code from a CDN: the Content Security Policy blocks it. Instead, runtime files are copied from `node_modules` into the site at build time and served from freethetools.com itself.

## Libraries you import in code

If the library is an ES module you `import` in `core.js` or `Tool.astro`, you don't need to do anything special. Install it with an exact version and Astro bundles it:

```sh
npm install --save-exact some-library
```

## Files loaded at runtime (WebAssembly, workers, data files)

Some libraries fetch extra files at runtime, such as a `.wasm` binary. List those files under `vendor` in your `tool.json`:

```json
"vendor": [
  { "from": "@jspawn/ghostscript-wasm/gs.js", "to": "gs.js" },
  { "from": "@jspawn/ghostscript-wasm/gs.wasm", "to": "gs.wasm" }
]
```

`from` is resolved like a Node `require`. `npm run build` and `npm run dev` copy each file to `public/<group>/<tool>/vendor/<to>`, so your code loads it from `/<group>/<tool>/vendor/<to>`. The `vendor` folders are generated, so they're git-ignored.

See `tools/pdf/compress/` for a full example.

## Checklist for reviewers

- Pinned exact version in `package.json`
- Licence compatible with AGPL-3.0, and added to `NOTICE` and `src/pages/licenses.astro`
- Size noted in the pull request (Cloudflare allows 25 MiB per static file)
