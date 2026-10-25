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
