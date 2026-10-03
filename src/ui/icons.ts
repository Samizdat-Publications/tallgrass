// Inline SVG icons, drawn for Tallgrass. 24 x 24 grid, 1.5 px stroke, round caps and joins, no fills.
// Each value is the inner markup of the <svg>. Color comes from currentColor.

// Wolf and bison are drawn in profile, facing left, so they read at 18 px. The add/remove mark sits top right.
const WOLF_HEAD =
  '<path d="M2.6 12.8 9.2 9.6l1-6.2L14 8c2.6.2 4.6 1.4 5.6 3.6l1.2 8-6.2-3c-3 .6-6.6 0-9.2-1.2l-2-.6c-1-.3-1.4-1.4-.8-2z"/>' +
  '<path d="M9.6 12.4h.01M3.4 13.3h.01"/>';

const BISON_HEAD =
  '<path d="M2.8 15.8 3.4 12.4l1.4-1.6C5.4 7.2 7 4.6 9.6 4.6c3 0 5 3.4 7.8 4.6l3.2.6.4 3.4-1 6.8h-1.8l-.6-5.4c-2.6.6-5.2.6-7.2.2L10 20H8.2l-.4-3.8c-1.4.6-3.4.8-4.6 0z"/>' +
  '<path d="M4.3 11.3c-1-.5-1.6-1.6-1.4-2.8M5.4 13.4h.01"/>';

export const ICONS: Record<string, string> = {
  rain:
    '<path d="M7.2 14.2A3.7 3.7 0 0 1 7 6.9a5.1 5.1 0 0 1 9.7 1.3 3.1 3.1 0 0 1 .3 6z"/>' +
    '<path d="M8.6 17.2 7.8 19.4M12.6 17.2l-.8 2.2M16.6 17.2l-.8 2.2"/>',
  drought:
    '<circle cx="12" cy="9.2" r="3.1"/>' +
    '<path d="M12 3v1.5M12 13.9v1.5M5.4 9.2h1.5M17.1 9.2h1.5M7.3 4.5l1.1 1.1M15.6 12.8l1.1 1.1M16.7 4.5l-1.1 1.1M8.4 12.8l-1.1 1.1"/>' +
    '<path d="M4 19.6h5l1.1-1.7 1.4 2 1.3-2.4 1 2.1H20"/>',
  fire:
    '<path d="M12 3.2c.4 2.9-1.2 4.2-2.6 5.7C8.1 10.3 7 12 7 14.3a5 5 0 0 0 10 0c0-1.6-.5-2.8-1.4-3.9-.3 1.1-.9 1.8-1.8 2.3.5-3.2-.3-6.7-1.8-9.5z"/>' +
    '<path d="M12 20.2a2.3 2.3 0 0 1-2.3-2.3c0-1.3.9-2 2.3-3.4 1.4 1.4 2.3 2.1 2.3 3.4a2.3 2.3 0 0 1-2.3 2.3z"/>',
  plague:
    '<circle cx="12" cy="12" r="4"/>' +
    '<path d="M12 8V4.6M12 19.4V16M8 12H4.6M19.4 12H16M9.2 9.2 6.8 6.8M17.2 17.2l-2.4-2.4M14.8 9.2l2.4-2.4M6.8 17.2l2.4-2.4"/>' +
    '<circle cx="12" cy="3.6" r=".9"/><circle cx="12" cy="20.4" r=".9"/><circle cx="3.6" cy="12" r=".9"/><circle cx="20.4" cy="12" r=".9"/>' +
    '<path d="M11 11.2h.01M13.2 13h.01"/>',
  cull:
    '<circle cx="12" cy="12" r="6.6"/>' +
    '<path d="M12 2.6v5M12 16.4v5M2.6 12h5M16.4 12h5"/><path d="M12 12h.01"/>',
  addWolves: WOLF_HEAD + '<path d="M19.2 2.2v4.4M17 4.4h4.4"/>',
  removeWolves: WOLF_HEAD + '<path d="M17 4.4h4.4"/>',
  addBison: BISON_HEAD + '<path d="M19.2 2.2v4.4M17 4.4h4.4"/>',

  pause: '<path d="M8.6 5.8v12.4M15.4 5.8v12.4" stroke-width="2.4"/>',
  next: '<path d="M6.5 6.2v11.6l8.6-5.8z"/><path d="M18.2 6v12"/>',
  menu: '<path d="M4.5 7.5h15M4.5 12h15M4.5 16.5h15"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  copy: '<rect x="8.6" y="8.6" width="10.4" height="10.4" rx="2.2"/><path d="M15.4 8.6V6.8a2.2 2.2 0 0 0-2.2-2.2H6.8a2.2 2.2 0 0 0-2.2 2.2v6.4a2.2 2.2 0 0 0 2.2 2.2h1.8"/>',
  check: '<path d="M5.5 12.6l4.2 4.2 8.8-9.6"/>',
  chevronUp: '<path d="M6.5 14.5 12 9l5.5 5.5"/>',
  chevronDown: '<path d="M6.5 9.5 12 15l5.5-5.5"/>',
  chevronRight: '<path d="M9.5 6.5 15 12l-5.5 5.5"/>',
  expand: '<path d="M14 4.8h5.2V10M10 19.2H4.8V14M19.2 4.8l-6 6M4.8 19.2l6-6"/>',
  shrink: '<path d="M19.2 10H14V4.8M4.8 14H10v5.2M14 10l5.2-5.2M10 14l-5.2 5.2"/>',
  layers:
    '<path d="M12 4.2 20 8.4l-8 4.2-8-4.2z"/><path d="M4.6 12.4 12 16.3l7.4-3.9M4.6 16.2 12 20l7.4-3.8"/>',
  follow: '<circle cx="12" cy="12" r="3"/><path d="M12 3.6v3.2M12 17.2v3.2M3.6 12h3.2M17.2 12h3.2"/>',
  scroll: '<path d="M6 5.2h12M6 9.8h12M6 14.4h8M6 19h5"/>',
  seed: '<path d="M12 20.5c-3.8-1.2-6-4.1-6-7.7 0-3.3 2.3-6.3 6-9.3 3.7 3 6 6 6 9.3 0 3.6-2.2 6.5-6 7.7z"/><path d="M12 20V9.5M12 14.6l-2.6-2.4M12 17l2.6-2.4"/>',
};

export function icon(name: string, size = 18): string {
  const body = ICONS[name] ?? '';
  // sized in the UI's scale unit so icons grow with the rest of the interface on large screens
  return `<svg class="tg-ic" style="width:calc(${size} * var(--u, 1px));height:calc(${size} * var(--u, 1px))" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}
