(() => {
  "use strict";

  const LOCK_KEY = "__shorts_scroll_guard_lock_until";
  const COOLDOWN_MS = 10000;
  const OVERLAY_ID = "shorts-scroll-guard-overlay";
  const MODE_KEY = "shortblockMode";

  let mode = "first";
  let lockTimer = null;
  let touchStart = null;
  let routeCheckPending = false;

  const isShortsPage = () =>
    /^\/shorts(?:\/|$)/.test(location.pathname);

  const lockUntil = () =>
    Number(sessionStorage.getItem(LOCK_KEY) || 0);

  const isLocked = () => lockUntil() > Date.now();

  function removeOverlay() {
    if (lockTimer) clearInterval(lockTimer);
    lockTimer = null;
    document.getElementById(OVERLAY_ID)?.remove();
  }

  function updateCountdown() {
    const countdown = document.getElementById("ssg-countdown");
    if (!countdown) return;

    const seconds = Math.max(
      0,
      Math.ceil((lockUntil() - Date.now()) / 1000)
    );

    countdown.textContent = String(seconds);

    if (seconds === 0) {
      sessionStorage.removeItem(LOCK_KEY);
      removeOverlay();
    }
  }

  function showOverlay() {
    if (!isLocked() || !document.documentElement) return;

    if (!document.getElementById(OVERLAY_ID)) {
      const overlay = document.createElement("div");
      overlay.id = OVERLAY_ID;
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");

      const panel = document.createElement("div");
      panel.className = "ssg-panel";

      const heading = document.createElement("h1");
      heading.className = "ssg-heading";
      heading.textContent = "Naah, we don't do that here.";

      const message = document.createElement("p");
      message.className = "ssg-message";
      message.textContent =
        "Your friendly neighbourhood ShortBlocker is " +
        "preventing a mindless dopamine rush. " +
        "You'll be back home in a few seconds.";

      const countdown = document.createElement("div");
      countdown.className = "ssg-countdown";
      countdown.id = "ssg-countdown";
      countdown.setAttribute("aria-live", "assertive");

      panel.append(heading, message, countdown);
      overlay.append(panel);
      document.documentElement.append(overlay);
    }

    updateCountdown();

    if (!lockTimer) {
      lockTimer = setInterval(updateCountdown, 100);
    }
  }

  function triggerCooldown() {
    if (isLocked()) {
      showOverlay();
      return;
    }

    sessionStorage.setItem(
      LOCK_KEY,
      String(Date.now() + COOLDOWN_MS)
    );

    // Leave the Shorts player and show the interruption on Home.
    location.assign("https://www.youtube.com/");
  }

  function applyMode() {
    if (!document.documentElement) return;

    document.documentElement.classList.toggle(
      "ssg-hide-shorts",
      mode === "all"
    );

    if (mode === "off") {
      sessionStorage.removeItem(LOCK_KEY);
      removeOverlay();
      return;
    }

    if (isLocked()) showOverlay();

    // All mode also blocks direct navigation to Shorts pages.
    if (mode === "all" && isShortsPage() && !isLocked()) {
      triggerCooldown();
    }
  }

  function onWheel(event) {
    if (mode !== "first" || !isShortsPage() || isLocked()) return;

    if (event.deltaY > 0) {
      event.preventDefault();
      event.stopImmediatePropagation();
      triggerCooldown();
    }
  }

  function onKeyDown(event) {
    if (mode !== "first" || !isShortsPage() || isLocked()) return;

    if (["ArrowDown", "PageDown", "End"].includes(event.key)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      triggerCooldown();
    }
  }

  function onTouchStart(event) {
    if (!isShortsPage() || !event.touches.length) return;

    touchStart = {
      x: event.touches[0].clientX,
      y: event.touches[0].clientY
    };
  }

  function onTouchEnd(event) {
    if (mode !== "first" || !isShortsPage() || !touchStart) return;

    const touch = event.changedTouches[0];
    if (!touch) return;

    const dy = touch.clientY - touchStart.y;
    const dx = touch.clientX - touchStart.x;
    touchStart = null;

    if (dy < -60 && Math.abs(dy) > Math.abs(dx) * 1.2) {
      event.preventDefault();
      event.stopImmediatePropagation();
      triggerCooldown();
    }
  }

  function blockDuringCooldown(event) {
    if (!isLocked()) return;

    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function checkRoute() {
    if (routeCheckPending) return;
    routeCheckPending = true;

    queueMicrotask(() => {
      routeCheckPending = false;
      applyMode();
    });
  }

  function boot() {
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

    document.addEventListener("touchend", onTouchEnd, {
      capture: true,
      passive: false
    });

    for (const type of [
      "click", "pointerdown", "mousedown", "keyup",
      "wheel", "touchmove", "touchend", "contextmenu"
    ]) {
      document.addEventListener(type, blockDuringCooldown, {
        capture: true,
        passive: false
      });
    }

    // YouTube is a single-page app; these events catch route changes.
    window.addEventListener("popstate", checkRoute);
    document.addEventListener("yt-navigate-finish", checkRoute);

    chrome.storage.sync.get({ [MODE_KEY]: "first" }, result => {
      mode = result[MODE_KEY];
      if (!["off", "first", "all"].includes(mode)) {
        mode = "first";
      }
      applyMode();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync" || !changes[MODE_KEY]) return;

      mode = changes[MODE_KEY].newValue || "first";
      applyMode();
    });

    new MutationObserver(() => {
      if (isLocked() && !document.getElementById(OVERLAY_ID)) {
        showOverlay();
      }
    }).observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  if (document.documentElement) {
    boot();
  } else {
    const observer = new MutationObserver(() => {
      if (!document.documentElement) return;
      observer.disconnect();
      boot();
    });

    observer.observe(document, { childList: true, subtree: true });
  }
})();