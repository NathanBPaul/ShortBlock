(() => {
  "use strict";

  const MODE_KEY = "shortblockInstagramMode";
  const ROOT_CLASS = "sb-instagram-block-all";
  const OVERLAY_ID = "sb-instagram-block-overlay";
  const LOCK_KEY = "__shortblock_instagram_lock_until";
  const COOLDOWN_MS = 10000;

  let mode = "off";
  let overlayTimer = null;
  let routeCheckQueued = false;
  let lastBlockedViewer = "";

  const isReelPath = (pathname = location.pathname) =>
    /^\/(?:reel|reels)(?:\/|$)/i.test(pathname);

  const getLockUntil = () =>
    Number(sessionStorage.getItem(LOCK_KEY) || 0);

  const isLocked = () => getLockUntil() > Date.now();

  // Detect a Reel opened in Instagram's /p/ viewer.
  // Instagram may expose the same shortcode through
  // a /username/reel/SHORTCODE/ link inside the viewer.
  function isDmReelViewer() {
    const match = location.pathname.match(/^\/p\/([^/]+)\/?$/i);
    if (!match) return false;

    const shortcode = match[1];

    return [...document.querySelectorAll("a[href]")].some(anchor => {
      try {
        const url = new URL(anchor.href, location.origin);

        if (url.origin !== location.origin) return false;

        const reelMatch = url.pathname.match(
          /^\/[^/]+\/reel\/([^/]+)\/?$/i
        );

        return reelMatch && reelMatch[1] === shortcode;
      } catch {
        return false;
      }
    });
  }

  function reelHrefFromElement(target) {
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

  function removeOverlay() {
    if (overlayTimer) clearInterval(overlayTimer);

    overlayTimer = null;
    document.getElementById(OVERLAY_ID)?.remove();
  }

  function updateOverlayCountdown() {
    const countdown = document.getElementById(
      "sb-instagram-countdown"
    );

    if (!countdown) return;

    const remaining = Math.max(
      0,
      Math.ceil((getLockUntil() - Date.now()) / 1000)
    );

    countdown.textContent = String(remaining);

    if (remaining === 0) {
      sessionStorage.removeItem(LOCK_KEY);
      removeOverlay();
    }
  }

  function showOverlay() {
    if (!document.documentElement || !isLocked()) return;

    if (!document.getElementById(OVERLAY_ID)) {
      const overlay = document.createElement("div");
      overlay.id = OVERLAY_ID;
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");

      const panel = document.createElement("div");
      panel.className = "sb-instagram-panel";

      const heading = document.createElement("h1");
      heading.className = "sb-instagram-heading";
      heading.textContent = "Naah, we don't do that here.";

      const message = document.createElement("p");
      message.className = "sb-instagram-message";
      message.textContent ="Your friendly neighbourhood ShortBlocker is keeping reels out of the way. Take a breath and stop slacking.";

      const countdown = document.createElement("div");
      countdown.id = "sb-instagram-countdown";
      countdown.className = "sb-instagram-countdown";
      countdown.setAttribute("aria-live", "assertive");

      panel.append(heading, message, countdown, homeLink);
      overlay.append(panel);
      document.documentElement.append(overlay);
    }

    updateOverlayCountdown();

    if (!overlayTimer) {
      overlayTimer = setInterval(updateOverlayCountdown, 200);
    }
  }

  function triggerBlock(viewerKey = location.pathname) {
    if (isLocked()) {
      showOverlay();
      return;
    }

    lastBlockedViewer = viewerKey;

    sessionStorage.setItem(
      LOCK_KEY,
      String(Date.now() + COOLDOWN_MS)
    );

    showOverlay();
  }

  function blockReelNavigation(event) {
    if (mode !== "all" || isLocked()) return;

    const url = reelHrefFromElement(event.target);
    if (!url) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    triggerBlock(url.pathname);
  }

  function blockDuringCooldown(event) {
    if (!isLocked()) return;

    // Keep the overlay's Home link usable.
    if (
      event.target instanceof Element &&
      event.target.closest(`#${OVERLAY_ID} a`)
    ) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function guardCurrentRoute() {
    if (mode !== "all" || !isReelPath()) return;

    try {
      history.replaceState(history.state, "", "/");
    } catch {
      location.replace("/");
      return;
    }

    triggerBlock("/");
  }

  function checkCurrentViewer() {
    if (mode !== "all") return;

    if (isReelPath()) {
      guardCurrentRoute();
      return;
    }

    if (!isDmReelViewer()) {
      lastBlockedViewer = "";
      return;
    }

    const viewerKey = location.pathname;

    // Avoid repeatedly triggering the same viewer.
    if (lastBlockedViewer === viewerKey) return;

    triggerBlock(viewerKey);
  }

  function queueRouteCheck() {
    if (routeCheckQueued) return;

    routeCheckQueued = true;

    queueMicrotask(() => {
      routeCheckQueued = false;
      checkCurrentViewer();
      applyMode();
    });
  }

  function applyMode() {
    if (!document.documentElement) return;

    document.documentElement.classList.toggle(
      ROOT_CLASS,
      mode === "all"
    );

    if (mode === "off") {
      sessionStorage.removeItem(LOCK_KEY);
      lastBlockedViewer = "";
      removeOverlay();
      return;
    }

    checkCurrentViewer();

    if (isLocked()) showOverlay();
  }

  function boot() {
    document.addEventListener("click", blockReelNavigation, {
      capture: true
    });

    document.addEventListener("auxclick", blockReelNavigation, {
      capture: true
    });

    for (const type of [
      "pointerdown",
      "mousedown",
      "keydown",
      "wheel",
      "touchmove",
      "touchend",
      "contextmenu"
    ]) {
      document.addEventListener(type, blockDuringCooldown, {
        capture: true,
        passive: false
      });
    }

    window.addEventListener("popstate", queueRouteCheck);

    const originalPushState = history.pushState;
    history.pushState = function (...args) {
      const result = originalPushState.apply(this, args);
      queueRouteCheck();
      return result;
    };

    const originalReplaceState = history.replaceState;
    history.replaceState = function (...args) {
      const result = originalReplaceState.apply(this, args);
      queueRouteCheck();
      return result;
    };

    chrome.storage.sync.get(
      { [MODE_KEY]: "off" },
      result => {
        mode = ["off", "all"].includes(result[MODE_KEY])
          ? result[MODE_KEY]
          : "off";

        applyMode();
      }
    );

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync" || !changes[MODE_KEY]) return;

      mode = ["off", "all"].includes(changes[MODE_KEY].newValue)
        ? changes[MODE_KEY].newValue
        : "off";

      applyMode();
    });

    const observer = new MutationObserver(() => {
      if (mode !== "all") return;
      checkCurrentViewer();

      if (isLocked() && !document.getElementById(OVERLAY_ID)) {
        showOverlay();
      }
    });

    if (document.documentElement) {
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true
      });
    }
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
