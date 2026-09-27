// Line drawings for each tool group, keyed by category slug. A tool may ship its own icon.svg.
const svg = (body: string) =>
  `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const CATEGORY_ICONS: Record<string, string> = {
  pdf: svg('<path d="M16 6h22l10 10v42H16z"/><path d="M38 6v10h10"/><path d="M24 30h16M24 38h16M24 46h10"/>'),
  images: svg('<rect x="8" y="12" width="48" height="40" rx="3"/><circle cx="22" cy="25" r="5"/><path d="M8 46l15-13 10 9 8-7 15 13"/>'),
  text: svg('<path d="M12 14h40M12 26h40M12 38h40M12 50h24"/>'),
  data: svg('<rect x="8" y="12" width="48" height="40" rx="3"/><path d="M8 25h48M8 38h48M25 12v40M40 12v40"/>'),
  developer: svg('<path d="M22 18L8 32l14 14M42 18l14 14-14 14M36 12l-8 40"/>'),
  everyday: svg('<circle cx="32" cy="35" r="20"/><path d="M32 24v11l8 6M25 8h14M32 8v7"/>'),
};

export const UI_ICONS = {
  home: svg('<path d="M8 30L32 10l24 20"/><path d="M14 26v28h36V26"/><path d="M27 54V38h10v16"/>'),
  info: svg('<circle cx="32" cy="32" r="24"/><path d="M32 29v16M32 20v1"/>'),
  code: svg('<path d="M22 18L8 32l14 14M42 18l14 14-14 14"/>'),
  plus: svg('<path d="M32 12v40M12 32h40"/>'),
  back: svg('<path d="M38 14L20 32l18 18"/>'),
  chevron: svg('<path d="M24 14l18 18-18 18"/>'),
  menu: svg('<path d="M10 18h44M10 32h44M10 46h44"/>'),
  search: svg('<circle cx="28" cy="28" r="16"/><path d="M40 40l14 14"/>'),
};
