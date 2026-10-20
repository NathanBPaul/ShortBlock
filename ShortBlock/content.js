(() => {
  "use strict";
  const LOCK_KEY = "__shorts_scroll_guard_lock_until";
  const COOLDOWN_MS = 5000;
  const OVERLAY_ID = "shorts-scroll-guard-overlay";

  let overlay = null;
  let lockTimer = null;
  let touchStart = null;

  function isShortsPage() {
    return /^\/shorts(?:\/|$)/.test(location.pathname);
  }

  function lockUntil() {
    return Number(sessionStorage.getItem(LOCK_KEY) || 0);
  }

  function isLocked() {
    return lockUntil() > Date.now();
  }

  function removeOverlay() {
    if (lockTimer) {
      clearInterval(lockTimer);
      lockTimer = null;
    }
    document.getElementById(OVERLAY_ID)?.remove();
    overlay = null;
  }

  function updateCountdown() {
    const countdown = document.getElementById("ssg-countdown");
    if (!countdown) return;
    const secondsLeft = Math.max(
      0,
      Math.ceil((lockUntil() - Date.now()) / 1000)
    );

    countdown.textContent = String(secondsLeft);

    if (secondsLeft === 0) {
      sessionStorage.removeItem(LOCK_KEY);
      removeOverlay();
    }
  }

  function showOverlay() {
    if (!isLocked() || !document.documentElement) return;

    if (!document.getElementById(OVERLAY_ID)) {
      overlay = document.createElement("div");
      overlay.id = OVERLAY_ID;
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      const panel = document.createElement("div");
      panel.className = "ssg-panel";
      const heading = document.createElement("h1");
      heading.className = "ssg-heading";
      heading.textContent = "Naah we dont do that here.";
      const message = document.createElement("p");
      message.className = "ssg-message";
      message.textContent =
        "Your friendly neighborhood extension that prevents mindless dopamine rushes out for the rescue. Youll be back home in 5 seconds..";

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
    if (isLocked()) return;

    sessionStorage.setItem(
      LOCK_KEY,
      String(Date.now() + COOLDOWN_MS)
    );

    // A full navigation interrupts the Shorts player.
    location.assign("https://www.youtube.com/");
  }

  function onWheel(event) {
    if (!isShortsPage() || isLocked()) return;

    // Downward wheel/touchpad movement triggers the cooldown.
    if (event.deltaY > 0) {
      event.preventDefault();
      event.stopImmediatePropagation();
      triggerCooldown();
    }
  }

  function onKeyDown(event) {
    if (!isShortsPage() || isLocked()) return;

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
    if (!isShortsPage() || !touchStart) return;

    const touch = event.changedTouches[0];
    const dy = touch.clientY - touchStart.y;
    const dx = touch.clientX - touchStart.x;

    touchStart = null;

    // Finger swipes upward to advance a vertical video feed.
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

  function boot() {
    // Capture events before YouTube's page handlers when possible.
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
      "click",
      "pointerdown",
      "mousedown",
      "keyup",
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

    if (isLocked()) {
      showOverlay();
    }

    // Recheck if YouTube replaces the overlay during rendering.
    new MutationObserver(() => {
      if (isLocked() &&
          !document.getElementById(OVERLAY_ID)) {
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
      if (document.documentElement) {
        observer.disconnect();
        boot();
      }
    });

    observer.observe(document, {
      childList: true,
      subtree: true
    });
  }
})();