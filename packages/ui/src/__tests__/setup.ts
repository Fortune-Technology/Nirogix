import "@testing-library/dom";

// jsdom does not implement these; Base UI's toast and our DataTable touch them.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

// jsdom has no layout, so it implements neither of these. Select keeps its active option
// in view with scrollIntoView, and positions its portalled panel from the trigger rect.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
