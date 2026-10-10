# Changelog entries

Add your pull request's changelog entry here, as its own file, instead of editing `CHANGELOG.md`. Pull requests then never collide in the changelog, and they can merge in any order.

1. Name the file `<slug>.<type>.md`, for example `video-to-gif.added.md`. The type is one of `added`, `changed`, `deprecated`, `removed`, `fixed` or `security`.
2. Write each entry as a line starting with `- `, in plain words for the people who use the site.

```markdown
- Video to GIF (Images, Convert): turn a short clip or screen recording into a GIF, in the browser.
```

The What's new page shows these entries under "Not yet released". `npm run release` moves them into `CHANGELOG.md` under the new version and deletes the files. See [How to release](../docs/how-to/release.md).
