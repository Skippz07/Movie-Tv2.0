/**
 * Rotates iframe sources when a host never completes loading.
 * Cross-origin frames cannot be inspected; a timely non-blank load is treated as success.
 */

import { serverSlotLabel } from './embedProviders.js';

const DEFAULT_ATTEMPT_MS = 13000;
const PLAYER_SANDBOX = 'allow-scripts allow-same-origin allow-presentation';
const PLAYER_ALLOW = 'autoplay; encrypted-media; fullscreen; picture-in-picture';

function hardenPlayerFrame(iframe) {
  iframe.setAttribute('sandbox', PLAYER_SANDBOX);
  iframe.setAttribute('allow', PLAYER_ALLOW);
  iframe.setAttribute('referrerpolicy', 'no-referrer');
  iframe.allowFullscreen = true;
}

/**
 * @param {HTMLIFrameElement} iframe
 * @param {object} opts
 * @param {string[]} opts.orderedKeys - include preferred host first.
 * @param {(key: string) => string | null} opts.buildUrl
 * @param {number} [opts.attemptMs]
 * @param {(text: string) => void} [opts.onStatus]
 * @param {(key: string | null, reason: 'load' | 'exhausted' | 'cancelled') => void} [opts.onResolved]
 * @returns {() => void} cancel
 */
export function playWithFailover(iframe, opts) {
  hardenPlayerFrame(iframe);

  const {
    orderedKeys = [],
    buildUrl,
    attemptMs = DEFAULT_ATTEMPT_MS,
    onStatus,
    onResolved,
  } = opts;

  let cancelled = false;
  let attemptIndex = 0;
  let loadHandler = null;
  let timeoutId = null;
  let activeAttemptId = 0;

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

  function finish(key, reason) {
    cleanupListeners();
    onStatus?.('');
    onResolved?.(key, reason);
  }

  function run() {
    if (cancelled) return;

    if (attemptIndex >= orderedKeys.length) {
      finish(null, 'exhausted');
      return;
    }

    const key = orderedKeys[attemptIndex];
    const url = buildUrl(key);

    if (!url) {
      attemptIndex += 1;
      run();
      return;
    }

    const attemptId = activeAttemptId + 1;
    activeAttemptId = attemptId;

    onStatus?.(
      `Trying ${serverSlotLabel(key)} (${attemptIndex + 1}/${orderedKeys.length})...`
    );

    loadHandler = () => {
      if (cancelled || attemptId !== activeAttemptId) return;
      if (!iframe.src || iframe.src === 'about:blank') return;
      finish(key, 'load');
    };

    iframe.addEventListener('load', loadHandler, { once: true });

    timeoutId = window.setTimeout(() => {
      if (cancelled || attemptId !== activeAttemptId) return;
      cleanupListeners();
      attemptIndex += 1;
      iframe.src = 'about:blank';
      requestAnimationFrame(() => run());
    }, attemptMs);

    hardenPlayerFrame(iframe);
    iframe.src = url;
  }

  run();

  return () => {
    cancelled = true;
    activeAttemptId += 1;
    cleanupListeners();
    onResolved?.(null, 'cancelled');
  };
}
