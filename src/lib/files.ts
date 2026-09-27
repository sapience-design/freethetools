// Small helpers shared by tool pages: file sizes, downloads and the drop area.
// Everything stays in the browser: files are read with the File API and handed back as blob: URLs.

export const fmtBytes = (n: number) =>
  n >= 1048576 ? `${(n / 1048576).toFixed(2)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`;

/** A download link for bytes made in the browser. */
export function downloadLink(data: BlobPart, filename: string, type: string, label = "Download") {
  const a = document.createElement("a");
  a.className = "btn";
  a.textContent = label;
  a.download = filename;
  a.href = URL.createObjectURL(new Blob([data], { type }));
  return a;
}

/** Base name without extension: "report.final.pdf" -> "report.final". */
export const baseName = (name: string) => name.replace(/\.[^.]+$/, "");

/**
 * Wire a DropZone (see src/components/DropZone.astro) to a handler. Clicking or pressing
 * Enter/Space opens the file picker; dropping files works too.
 */
export function wireDrop(prefix: string, onFiles: (files: File[]) => void) {
  const drop = document.getElementById(`${prefix}-drop`)!;
  const input = document.getElementById(`${prefix}-file`) as HTMLInputElement;
  drop.addEventListener("click", () => input.click());
  drop.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); }
  });
  input.addEventListener("change", () => { onFiles([...(input.files ?? [])]); input.value = ""; });
  for (const t of ["dragenter", "dragover"]) drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); });
  for (const t of ["dragleave", "drop"]) drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove("over"); });
  drop.addEventListener("drop", (e) => onFiles([...((e as DragEvent).dataTransfer?.files ?? [])]));
}

/** Show a plain-language error in an element. */
export function showError(el: HTMLElement, message: string) {
  el.replaceChildren();
  const p = document.createElement("p");
  p.className = "tool-error";
  p.textContent = message;
  el.append(p);
}
