import '@testing-library/jest-dom/vitest';

// jsdom has no modal dialogs and no scrolling; the app relies on both.
Object.assign(HTMLDialogElement.prototype, {
  showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  },
  close(this: HTMLDialogElement) {
    this.removeAttribute('open');
  },
});
Object.defineProperty(window, 'scrollTo', { value: () => undefined, writable: true });

// jsdom has no matchMedia either. Tests can fire a change with `fireMediaChange`.
const mediaListeners = new Set<(event: MediaQueryListEvent) => void>();
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (media: string) => ({
    media,
    matches: false,
    addEventListener: (_type: 'change', listener: (event: MediaQueryListEvent) => void) => mediaListeners.add(listener),
    removeEventListener: (_type: 'change', listener: (event: MediaQueryListEvent) => void) => mediaListeners.delete(listener),
  }),
});

export function fireMediaChange(matches: boolean): void {
  for (const listener of mediaListeners) {
    listener({ matches } as MediaQueryListEvent);
  }
}
