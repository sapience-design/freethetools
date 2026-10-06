// The site's Content Security Policy has connect-src 'self', so a page can't fetch() a blob: URL
// it made. To record a person's downloads, remember the Blob behind each blob: URL at the moment
// the tool makes it. Installed once, on tool pages, before anyone clicks.

/** @type {Map<string, Blob>} */
export const blobsByUrl = new Map();
const rawCreate = URL.createObjectURL.bind(URL);
const rawRevoke = URL.revokeObjectURL.bind(URL);
let installed = false;

export function installBlobCapture() {
  if (installed) return;
  installed = true;
  URL.createObjectURL = (obj) => {
    const url = rawCreate(obj);
    if (obj instanceof Blob) blobsByUrl.set(url, obj);
    return url;
  };
  // Keep the Blob a little after revoking: a tool may revoke an old link as it adds a new one.
  URL.revokeObjectURL = (url) => {
    rawRevoke(url);
    setTimeout(() => blobsByUrl.delete(url), 2000);
  };
}

/** A blob: URL for this page's own links that is not recorded. */
export const plainUrl = (blob) => rawCreate(blob);
