(() => {
  "use strict";

  // ShortBlock Instagram Reels blocker — fresh implementation.
  const MODE_KEY = "shortblockInstagramMode";
  const OVERLAY_ID = "sb-instagram-block-overlay";
  const COUNTDOWN_ID = "sb-instagram-countdown";
  const LOCK_KEY = "__shortblock_instagram_lock_until";
  const COOLDOWN_MS = 10_000;

  let mode = "off";
  let timer = null;
  let observer = null;
  let routeCheckQueued = false;
  let lastDmViewer = "";
  let started = false;

  const now = () => Date.now();

  function getLockUntil() {
    try {
      return Number(sessionStorage.getItem(LOCK_KEY)) || 0;
    } catch {
      return 0;
    }
  }

  function isLocked() {
    return getLockUntil() > now();
  }

  function saveLockUntil(timestamp) {
    try {
      if (timestamp > 0) {
        sessionStorage.setItem(LOCK_KEY, String(timestamp));
      } else {
        sessionStorage.removeItem(LOCK_KEY);
      }
    } catch {
      // The in-memory overlay can still work if storage is unavailable.
    }
  }

  // Match actual Reel permalink routes, including username-based URLs.
  function isReelPath(pathname = location.pathname) {
    return (
      /^\/reel\/[^/]+\/?$/i.test(pathname) ||
      /^\/reels?\/[^/]+\/?$/i.test(pathname) ||
      /^\/[^/]+\/reel\/[^/]+\/?$/i.test(pathname)
    );
  }

  function getReelUrlFromElement(target) {
    if (!(target instanceof Element)) return null;

    const anchor = target.closest("a[href]");
    if (!anchor) return null;

    try {
      const url = new URL(anchor.href, location.origin);

      if (url.origin !== location.origin) return null;
      if (!isReelPath(url.pathname)) return null;

      return url;
    } catch {
      return null;
    }
  }

  // DM viewers can use /p/SHORTCODE/ instead of a Reel permalink.
  // Only treat that viewer as a Reel when the DOM contains a matching
  // /username/reel/SHORTCODE/ link. Do not block every /p/ post.
  function getDmReelViewerKey() {
    const match = location.pathname.match(/^\/p\/([^/]+)\/?$/i);
    if (!match) return "";

    const shortcode = match[1];

    for (const anchor of document.querySelectorAll("a[href]")) {
      try {
        const url = new URL(anchor.href, location.origin);

        if (url.origin !== location.origin) continue;

        const reelMatch = url.pathname.match(
          /^\/[^/]+\/reel\/([^/]+)\/?$/i
        );

        if (reelMatch && reelMatch[1] === shortcode) {
          return location.pathname;
        }
      } catch {
        // Ignore malformed links.
      }
    }

    return "";
  }

  function removeOverlay() {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }

    document.getElementById(OVERLAY_ID)?.remove();
  }

  function updateCountdown() {
    const countdown = document.getElementById(COUNTDOWN_ID);
    if (!countdown) return;

    const remaining = Math.max(
      0,
      Math.ceil((getLockUntil() - now()) / 1000)
    );

    countdown.textContent = String(remaining);

    if (remaining === 0) {
      saveLockUntil(0);
      removeOverlay();
    }
  }

  function showOverlay() {
    if (!document.documentElement || !isLocked()) return;

    let overlay = document.getElementById(OVERLAY_ID);

    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = OVERLAY_ID;
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-labelledby", "sb-instagram-heading");

      const panel = document.createElement("div");
      panel.className = "sb-instagram-panel";

      const heading = document.createElement("h1");
      heading.id = "sb-instagram-heading";
      heading.className = "sb-instagram-heading";
      heading.textContent = "Naah, we don't do that here.";

      const message = document.createElement("p");
      message.className = "sb-instagram-message";
      message.textContent ="Your friendly neighbourhood ShortBlocker is keeping them reels out of the way. Stop slacking and get on with it.";

      const countdown = document.createElement("div");
      countdown.id = COUNTDOWN_ID;
      countdown.className = "sb-instagram-countdown";
      countdown.setAttribute("aria-live", "off");
      countdown.setAttribute("aria-label", "Seconds remaining");

      panel.append(heading, message, countdown);
      overlay.append(panel);
      document.documentElement.append(overlay);
    }

    updateCountdown();

    if (timer === null) {
      timer = setInterval(updateCountdown, 200);
    }
  }

  function triggerBlock(viewerKey = location.pathname) {
    if (isLocked()) {
      showOverlay();
      return;
    }

    lastDmViewer = viewerKey;
    saveLockUntil(now() + COOLDOWN_MS);
    showOverlay();
  }

  // Stop ordinary and middle-click navigation before Instagram handles it.
  function interceptReelLink(event) {
    if (mode !== "all" || isLocked()) return;

    const url = getReelUrlFromElement(event.target);
    if (!url) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    triggerBlock(url.pathname);
  }

  // Prevent interaction with the page beneath the full-screen overlay.
  function blockInteractionDuringCooldown(event) {
    if (!isLocked()) return;

    const overlay = document.getElementById(OVERLAY_ID);

    if (overlay && event.target instanceof Node &&
        overlay.contains(event.target)) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function returnHomeAndBlock() {
    if (mode !== "all" || !isReelPath()) return;

    // Change the visible route without navigating through another Reel.
    try {
      history.replaceState(history.state, "", "/");
    } catch {
      // If history manipulation fails, avoid an uncontrolled redirect loop.
    }

    triggerBlock("/");
  }

  function checkCurrentRoute() {
    if (mode !== "all") return;

    if (isReelPath()) {
      returnHomeAndBlock();
      return;
    }

    const dmViewerKey = getDmReelViewerKey();

    if (!dmViewerKey) {
      lastDmViewer = "";
      return;
    }

    if (dmViewerKey === lastDmViewer && isLocked()) {
      showOverlay();
      return;
    }

    if (dmViewerKey !== lastDmViewer) {
      triggerBlock(dmViewerKey);
    }
  }

  function queueRouteCheck() {
    if (routeCheckQueued) return;

    routeCheckQueued = true;

    queueMicrotask(() => {
      routeCheckQueued = false;
      checkCurrentRoute();
    });
  }

  function applyMode() {
    if (!document.documentElement) return;

    document.documentElement.classList.toggle(
      "sb-instagram-block-all",
      mode === "all"
    );

    if (mode === "off") {
      saveLockUntil(0);
      lastDmViewer = "";
      removeOverlay();
      return;
    }

    if (isLocked()) {
      showOverlay();
    }

    checkCurrentRoute();
  }

  function onStorageChanged(changes, area) {
    if (area !== "sync" || !changes[MODE_KEY]) return;

    const nextMode = changes[MODE_KEY].newValue;
    mode = nextMode === "all" ? "all" : "off";

    applyMode();
  }

  function boot() {
    if (started) return;
    started = true;

    document.addEventListener("click", interceptReelLink, true);
    document.addEventListener("auxclick", interceptReelLink, true);

    for (const type of [
      "pointerdown",
      "mousedown",
      "keydown",
      "keyup",
      "wheel",
      "touchmove",
      "touchend",
      "contextmenu",
      "submit"
    ]) {
      document.addEventListener(
        type,
        blockInteractionDuringCooldown,
        { capture: true, passive: false }
      );
    }

    window.addEventListener("popstate", queueRouteCheck);

    // Instagram uses client-side navigation. Watch history changes too.
    for (const method of ["pushState", "replaceState"]) {
      const original = history[method];

      history[method] = function (...args) {
        const result = original.apply(this, args);
        queueRouteCheck();
        return result;
      };
    }

    chrome.storage.sync.get(
      { [MODE_KEY]: "off" },
      result => {
        mode = result[MODE_KEY] === "all" ? "all" : "off";
        applyMode();
      }
    );

    chrome.storage.onChanged.addListener(onStorageChanged);

    observer = new MutationObserver(() => {
      if (mode !== "all") return;

      if (isLocked() && !document.getElementById(OVERLAY_ID)) {
        showOverlay();
      }

      // Reel links may appear after Instagram renders a viewer.
      checkCurrentRoute();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  if (document.documentElement) {
    boot();
  } else {
    const startObserver = new MutationObserver(() => {
      if (!document.documentElement) return;

      startObserver.disconnect();
      boot();
    });

    startObserver.observe(document, {
      childList: true,
      subtree: true
    });
  }
})();
