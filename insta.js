(() => {
  "use strict";

  const MODE_KEY = "shortblockInstagramMode";
  const OVERLAY_ID = "sb-instagram-block-overlay";
  const COUNTDOWN_ID = "sb-instagram-countdown";
  const LOCK_KEY = "__shortblock_instagram_lock_until";

  const TAB_ACTIVE_KEY = "__sb_instagram_reels_tab_active";
  const FIRST_REEL_KEY = "__sb_instagram_first_reel_path";
  const DM_REEL_KEY = "__sb_instagram_dm_reel_path";

  const COOLDOWN_MS = 10_000;

  let mode = "off";
  let timer = null;
  let observer = null;
  let routeCheckQueued = false;
  let returningHome = false;
  let lastBlockedDmViewer = "";

  let touchStart = null;
  let touchBlockTriggered = false;
  let started = false;

  const now = () => Date.now();

  function readSession(key) {
    try {
      return sessionStorage.getItem(key) || "";
    } catch {
      return "";
    }
  }

  function writeSession(key, value) {
    try {
      if (value) {
        sessionStorage.setItem(key, value);
      } else {
        sessionStorage.removeItem(key);
      }
    } catch {
      // Continue without session storage if unavailable.
    }
  }

  function getLockUntil() {
    return Number(readSession(LOCK_KEY)) || 0;
  }

  function isLocked() {
    return getLockUntil() > now();
  }

  function saveLockUntil(timestamp) {
    writeSession(LOCK_KEY, timestamp > 0 ? String(timestamp) : "");
  }

  function isReelsTabRoot(pathname = location.pathname) {
    return /^\/reels\/?$/i.test(pathname);
  }

  function isDirectInboxPath(pathname = location.pathname) {
    return /^\/direct(?:\/|$)/i.test(pathname);
  }

  // Return a Reel permalink path, or an empty string.
  function getReelPath(pathname = location.pathname) {
    if (
      /^\/reel\/[^/]+\/?$/i.test(pathname) ||
      /^\/reels\/[^/]+\/?$/i.test(pathname) ||
      /^\/[^/]+\/reel\/[^/]+\/?$/i.test(pathname)
    ) {
      return pathname;
    }

    return "";
  }

  function isReelPage(pathname = location.pathname) {
    return Boolean(getReelPath(pathname));
  }

  function getAnchorUrl(target) {
    if (!(target instanceof Element)) return null;

    const anchor = target.closest("a[href]");
    if (!anchor) return null;

    try {
      const url = new URL(anchor.href, location.origin);

      if (url.origin !== location.origin) return null;

      return url;
    } catch {
      return null;
    }
  }

  function getLockingContext() {
    if (mode !== "first") return "";

    // Reels-tab root or a Reel reached from that tab.
    if (
      isReelsTabRoot() ||
      (
        readSession(TAB_ACTIVE_KEY) === "1" &&
        !isDirectInboxPath()
      )
    ) {
      return "tab";
    }

    // A Reel deliberately opened through a DM link.
    const dmPath = readSession(DM_REEL_KEY);

    if (dmPath && dmPath === location.pathname) {
      return "dm";
    }

    // Instagram sometimes displays a DM Reel as /p/SHORTCODE/.
    if (getDmReelViewerKey()) {
      return "dm";
    }

    // Also limit scrolling on an individually opened Reel.
    if (isReelPage()) {
      return "individual";
    }

    return "";
  }

  // Identify Reel viewers that Instagram displays through /p/ URLs.
  // A normal post is not classified as a Reel unless a matching Reel
  // permalink is present in the viewer.
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

  // Try to find the Reel currently displayed when the URL is just /reels/.
  function discoverVisibleReelPath() {
    const currentPath = getReelPath();

    if (currentPath) return currentPath;

    const videos = [...document.querySelectorAll("video")];

    const visibleVideos = videos.map(video => {
      const rect = video.getBoundingClientRect();

      const visibleWidth = Math.max(
        0,
        Math.min(rect.right, window.innerWidth) -
          Math.max(rect.left, 0)
      );

      const visibleHeight = Math.max(
        0,
        Math.min(rect.bottom, window.innerHeight) -
          Math.max(rect.top, 0)
      );

      const visibleArea = visibleWidth * visibleHeight;
      const centerY = rect.top + rect.height / 2;
      const centerX = rect.left + rect.width / 2;

      const centerDistance =
        Math.abs(centerY - window.innerHeight / 2) +
        Math.abs(centerX - window.innerWidth / 2);

      return {
        video,
        score: visibleArea - centerDistance * 100
      };
    }).filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score);

    for (const item of visibleVideos) {
      let element = item.video;

      // Search the nearest surrounding viewer/card first.
      for (let depth = 0; element && depth < 9; depth++) {
        const anchors = [];

        if (element.matches?.("a[href]")) {
          anchors.push(element);
        }

        anchors.push(...element.querySelectorAll("a[href]"));

        for (const anchor of anchors) {
          const url = getAnchorUrl(anchor);
          if (!url) continue;

          const reelPath = getReelPath(url.pathname);
          if (reelPath) return reelPath;
        }

        element = element.parentElement;
      }
    }

    return "";
  }

  function rememberFirstReel() {
    if (readSession(TAB_ACTIVE_KEY) !== "1") return;
    if (readSession(FIRST_REEL_KEY)) return;

    const path = discoverVisibleReelPath();

    if (path) {
      writeSession(FIRST_REEL_KEY, path);
    }
  }

  function clearReelsTabState() {
    writeSession(TAB_ACTIVE_KEY, "");
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
      message.textContent ="Your friendly neighbourhood ShortBlocker is keeping endless reels out of the way. Take a breath and stop sulking.";

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

  function startCooldown({ returnHome = false } = {}) {
    if (isLocked()) {
      if (returnHome && location.pathname !== "/") {
        clearReelsTabState();

        if (!returningHome) {
          returningHome = true;
          location.replace("/");
        }
      } else {
        showOverlay();
      }

      return;
    }

    saveLockUntil(now() + COOLDOWN_MS);

    if (returnHome) {
      clearReelsTabState();
      returningHome = true;

      if (location.pathname !== "/") {
        // Replace the blocked route so Back doesn't reopen it immediately.
        location.replace("/");
        return;
      }
    }

    showOverlay();
  }

  function onReelLinkClick(event) {
    const url = getAnchorUrl(event.target);
    if (!url) return;

    // Block All mode prevents all Reel links and direct Reels-tab entry.
    if (mode === "all") {
      if (isReelPage(url.pathname)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        startCooldown();
        return;
      }

      if (isReelsTabRoot(url.pathname)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        startCooldown({ returnHome: true });
      }

      return;
    }

    if (mode !== "first") return;

    // Reels deliberately opened from a DM remain individually accessible.
    if (isDirectInboxPath()) {
      const dmReelPath = getReelPath(url.pathname);

      if (dmReelPath) {
        writeSession(DM_REEL_KEY, dmReelPath);
        clearReelsTabState();
      }

      return;
    }

    // Let the first Reels-tab visit open normally. Once a first Reel has
    // been recorded, route later visits back to that same Reel.
    if (isReelsTabRoot(url.pathname)) {
      clearSessionDmPath();
      writeSession(TAB_ACTIVE_KEY, "1");

      const firstPath = readSession(FIRST_REEL_KEY);

      if (firstPath) {
        event.preventDefault();
        event.stopImmediatePropagation();

        if (firstPath !== location.pathname) {
          location.assign(firstPath);
        }

        return;
      }
    }
  }

  function clearSessionDmPath() {
    writeSession(DM_REEL_KEY, "");
    lastBlockedDmViewer = "";
  }

  function onCooldownInteraction(event) {
    if (!isLocked()) return;

    const overlay = document.getElementById(OVERLAY_ID);

    if (
      overlay &&
      event.target instanceof Node &&
      overlay.contains(event.target)
    ) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function blockAdvance(context) {
    if (mode !== "first" || !context) return;

    if (isLocked()) {
      showOverlay();
      return;
    }

    if (context === "tab") {
      // Save the current Reel before returning Home.
      rememberFirstReel();
      startCooldown({ returnHome: true });
      return;
    }

    // DM or individually opened Reel: block advancing, but don't prevent
    // the user from opening a different Reel directly from their chat.
    startCooldown();
  }

  function onWheel(event) {
    if (event.deltaY <= 0) return;

    const context = getLockingContext();
    if (!context) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    blockAdvance(context);
  }

  function onKeyDown(event) {
    if (!["ArrowDown", "PageDown", "End"].includes(event.key)) return;

    const context = getLockingContext();
    if (!context) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    blockAdvance(context);
  }

  function onTouchStart(event) {
    if (!event.touches.length || !getLockingContext()) {
      touchStart = null;
      touchBlockTriggered = false;
      return;
    }

    touchStart = {
      x: event.touches[0].clientX,
      y: event.touches[0].clientY
    };

    touchBlockTriggered = false;
  }

  function onTouchMove(event) {
    if (!touchStart || touchBlockTriggered || !event.touches.length) {
      return;
    }

    const touch = event.touches[0];
    const dy = touch.clientY - touchStart.y;
    const dx = touch.clientX - touchStart.x;

    // An upward swipe advances to the next Reel.
    if (dy < -55 && Math.abs(dy) > Math.abs(dx) * 1.2) {
      const context = getLockingContext();
      if (!context) return;

      touchBlockTriggered = true;
      event.preventDefault();
      event.stopImmediatePropagation();
      blockAdvance(context);
    }
  }

  function onTouchEnd() {
    touchStart = null;
    touchBlockTriggered = false;
  }

  function checkCurrentRoute() {
    if (mode === "off") return;

    if (mode === "all") {
      if (isReelsTabRoot() || isReelPage()) {
        startCooldown({ returnHome: true });
        return;
      }

      const dmViewer = getDmReelViewerKey();

      if (dmViewer && dmViewer !== lastBlockedDmViewer) {
        lastBlockedDmViewer = dmViewer;
        startCooldown();
      }

      return;
    }

    // First-Reel mode.
    if (isReelsTabRoot()) {
      clearSessionDmPath();
      writeSession(TAB_ACTIVE_KEY, "1");

      const firstPath = readSession(FIRST_REEL_KEY);

      if (firstPath) {
        // The tab was reopened: return to the same known Reel.
        if (location.pathname !== firstPath) {
          location.replace(firstPath);
          return;
        }
      }

      rememberFirstReel();
      return;
    }

    if (isDirectInboxPath()) {
      clearReelsTabState();
      return;
    }

    if (readSession(TAB_ACTIVE_KEY) === "1" && isReelPage()) {
      const firstPath = readSession(FIRST_REEL_KEY);

      if (firstPath && firstPath !== location.pathname) {
        startCooldown({ returnHome: true });
        return;
      }

      rememberFirstReel();
      return;
    }

    // Keep the DM context separate from the Reels-tab allowance.
    const dmViewer = getDmReelViewerKey();

    if (!dmViewer && readSession(DM_REEL_KEY) !== location.pathname) {
      clearSessionDmPath();
    }

    if (!isReelPage() && !dmViewer) {
      clearReelsTabState();
    }
  }

  function queueRouteCheck() {
    if (routeCheckQueued) return;

    routeCheckQueued = true;

    queueMicrotask(() => {
      routeCheckQueued = false;
      checkCurrentRoute();
      rememberFirstReel();
    });
  }

  function applyMode() {
    if (!document.documentElement) return;

    document.documentElement.classList.toggle(
      "sb-instagram-hide-feed-reels",
      mode === "first" || mode === "all"
    );

    document.documentElement.classList.toggle(
      "sb-instagram-block-all",
      mode === "all"
    );

    if (mode === "off") {
      saveLockUntil(0);
      clearReelsTabState();
      writeSession(FIRST_REEL_KEY, "");
      clearSessionDmPath();
      removeOverlay();
      return;
    }

    if (isLocked()) {
      showOverlay();
    }

    checkCurrentRoute();
    rememberFirstReel();
  }

  function normalizeMode(value) {
    return ["off", "first", "all"].includes(value) ? value : "off";
  }

  function boot() {
    if (started) return;
    started = true;

    document.addEventListener("click", onReelLinkClick, true);
    document.addEventListener("auxclick", onReelLinkClick, true);

    document.addEventListener("wheel", onWheel, {
      capture: true,
      passive: false
    });

    document.addEventListener("keydown", onKeyDown, {
      capture: true,
      passive: false
    });

    document.addEventListener("touchstart", onTouchStart, {
      capture: true,
      passive: true
    });

    document.addEventListener("touchmove", onTouchMove, {
      capture: true,
      passive: false
    });

    document.addEventListener("touchend", onTouchEnd, {
      capture: true,
      passive: true
    });

    for (const type of [
      "pointerdown",
      "mousedown",
      "keyup",
      "contextmenu",
      "submit"
    ]) {
      document.addEventListener(type, onCooldownInteraction, {
        capture: true,
        passive: false
      });
    }

    window.addEventListener("popstate", queueRouteCheck);

    for (const method of ["pushState", "replaceState"]) {
      const original = history[method];

      history[method] = function (...args) {
        const result = original.apply(this, args);
        queueRouteCheck();
        return result;
      };
    }

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        queueRouteCheck();
        if (isLocked()) showOverlay();
      }
    });

    chrome.storage.sync.get(
      { [MODE_KEY]: "off" },
      result => {
        mode = normalizeMode(result[MODE_KEY]);
        applyMode();
      }
    );

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync" || !changes[MODE_KEY]) return;

      mode = normalizeMode(changes[MODE_KEY].newValue);
      applyMode();
    });

    observer = new MutationObserver(() => {
      if (mode === "off") return;

      if (isLocked() && !document.getElementById(OVERLAY_ID)) {
        showOverlay();
      }

      // Instagram renders its viewer and Reel links asynchronously.
      rememberFirstReel();
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
