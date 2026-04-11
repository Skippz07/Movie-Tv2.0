/**
 * Rotates iframe sources when a host never completes loading (common when embeds hang).
 * Cross-origin frames cannot be inspected; we treat a timely <code>load</code> as success.
 */

import { serverSlotLabel } from './embedProviders.js';

const DEFAULT_ATTEMPT_MS = 13000;

/**
 * @param {HTMLIFrameElement} iframe
 * @param {object} opts
 * @param {string[]} opts.orderedKeys — include preferred host first (see getFailoverOrder)
 * @param {(key: string) => string | null} opts.buildUrl
 * @param {number} [opts.attemptMs]
 * @param {(text: string) => void} [opts.onStatus]
 * @param {(key: string | null, reason: 'load' | 'exhausted' | 'cancelled') => void} [opts.onResolved]
 * @returns {() => void} cancel
 */
export function playWithFailover(iframe, opts) {
  const {
    orderedKeys,
    buildUrl,
    attemptMs = DEFAULT_ATTEMPT_MS,
    onStatus,
    onResolved,
  } = opts;

  let cancelled = false;
  let attemptIndex = 0;
  let loadHandler = null;
  let timeoutId = null;

  function cleanupListeners() {
    if (timeoutId != null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    if (loadHandler) {
      iframe.removeEventListener('load', loadHandler);
      loadHandler = null;
    }
  }

  function run() {
    if (cancelled) return;

    if (attemptIndex >= orderedKeys.length) {
      onStatus?.('');
      onResolved?.(null, 'exhausted');
      return;
    }

    const key = orderedKeys[attemptIndex];
    const url = buildUrl(key);

    if (!url) {
      attemptIndex += 1;
      run();
      return;
    }

    onStatus?.(
      `Trying ${serverSlotLabel(key)} (${attemptIndex + 1}/${orderedKeys.length})…`
    );

    loadHandler = () => {
      if (cancelled) return;
      cleanupListeners();
      onStatus?.('');
      onResolved?.(key, 'load');
    };

    iframe.addEventListener('load', loadHandler, { once: true });

    timeoutId = window.setTimeout(() => {
      if (cancelled) return;
      cleanupListeners();
      attemptIndex += 1;
      iframe.src = 'about:blank';
      requestAnimationFrame(() => run());
    }, attemptMs);

    iframe.src = url;
  }

  run();

  return () => {
    cancelled = true;
    cleanupListeners();
  };
}
