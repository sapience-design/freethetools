// Links to other sites open in a new tab, so this page stays where it is while the other site
// loads, and a job half done in a tool is not lost. Screen readers hear "(opens in a new tab)".
// Links a tool draws later, such as the Markdown preview, are marked as they appear.

export const NEW_TAB = " (opens in a new tab)";

/** True for an http(s) link to another site. Downloads, mailto: and same-site links are left alone. */
export function isExternal(a, origin) {
  const href = a.getAttribute("href") || "";
  if (!/^https?:\/\//i.test(href) || a.hasAttribute("download")) return false;
  try { return new URL(href).origin !== origin; } catch { return false; }
}

/** Mark one link: new tab, no access to this page, and a spoken note. Safe to call twice. */
export function markLink(a, doc = a.ownerDocument) {
  if (a.dataset.newTab === "1") return;
  a.dataset.newTab = "1";
  a.target = "_blank";
  const rel = new Set((a.getAttribute("rel") || "").split(/\s+/).filter(Boolean));
  rel.add("noopener");
  a.setAttribute("rel", [...rel].join(" "));
  const label = a.getAttribute("aria-label");
  if (label !== null) {
    // An aria-label replaces the link's text for screen readers, so the note goes into it.
    if (!label.endsWith(NEW_TAB)) a.setAttribute("aria-label", label + NEW_TAB);
    return;
  }
  const note = doc.createElement("span");
  note.className = "sr-only";
  note.textContent = NEW_TAB;
  a.append(note);
}

/** Mark every outside link under `root`. */
export function markExternalLinks(root, origin) {
  const links = root.matches?.("a[href]") ? [root] : [];
  for (const a of [...links, ...(root.querySelectorAll?.("a[href]") ?? [])]) if (isExternal(a, origin)) markLink(a);
}

/** Mark the page now, and links added later. */
export function watchExternalLinks(doc = document, origin = location.origin) {
  markExternalLinks(doc.body, origin);
  new MutationObserver((changes) => {
    for (const c of changes) {
      if (c.type === "attributes") { if (isExternal(c.target, origin)) markLink(c.target); continue; }
      for (const n of c.addedNodes) if (n.nodeType === 1) markExternalLinks(n, origin);
    }
  }).observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["href"] });
}
