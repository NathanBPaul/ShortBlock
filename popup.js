"use strict";

const YOUTUBE_MODE_KEY = "shortblockMode";
const INSTAGRAM_MODE_KEY = "shortblockInstagramMode";

const VALID_YOUTUBE_MODES = ["off", "first", "all"];
const VALID_INSTAGRAM_MODES = ["off", "first", "all"];

const youtubeStatus = document.getElementById("youtube-status");
const instagramStatus = document.getElementById("instagram-status");

const youtubeRadios = document.querySelectorAll(
  'input[name="youtube-mode"]'
);

const instagramRadios = document.querySelectorAll(
  'input[name="instagram-mode"]'
);

function describeYouTubeMode(mode) {
  return {
    off: "YouTube Shorts blocking is off.",
    first: "The first YouTube Short is only allowed.",
    all: "All YouTube Shorts are blocked."
  }[mode] || "Settings saved.";
}

function describeInstagramMode(mode) {
  return {
    off: "Instagram Reels blocking is off.",
    first: "One Reel at a time. Scrolling to another is blocked.",
    all: "All Instagram Reels are blocked."
  }[mode] || "Settings saved.";
}

function loadSettings() {
  chrome.storage.sync.get(
    {
      [YOUTUBE_MODE_KEY]: "first",
      [INSTAGRAM_MODE_KEY]: "off"
    },
    result => {
      const youtubeMode = VALID_YOUTUBE_MODES.includes(
        result[YOUTUBE_MODE_KEY]
      )
        ? result[YOUTUBE_MODE_KEY]
        : "first";

      const instagramMode = VALID_INSTAGRAM_MODES.includes(
        result[INSTAGRAM_MODE_KEY]
      )
        ? result[INSTAGRAM_MODE_KEY]
        : "off";

      const selectedYouTube = document.querySelector(
        `input[name="youtube-mode"][value="${youtubeMode}"]`
      );

      const selectedInstagram = document.querySelector(
        `input[name="instagram-mode"][value="${instagramMode}"]`
      );

      if (selectedYouTube) selectedYouTube.checked = true;
      if (selectedInstagram) selectedInstagram.checked = true;

      youtubeStatus.textContent = describeYouTubeMode(youtubeMode);
      instagramStatus.textContent = describeInstagramMode(instagramMode);
    }
  );
}

youtubeRadios.forEach(radio => {
  radio.addEventListener("change", () => {
    if (!radio.checked) return;
    if (!VALID_YOUTUBE_MODES.includes(radio.value)) return;

    youtubeStatus.textContent = "Saving…";

    chrome.storage.sync.set(
      { [YOUTUBE_MODE_KEY]: radio.value },
      () => {
        if (chrome.runtime.lastError) {
          youtubeStatus.textContent = "Couldn't save. Please try again.";
          return;
        }

        youtubeStatus.textContent = describeYouTubeMode(radio.value);
      }
    );
  });
});

instagramRadios.forEach(radio => {
  radio.addEventListener("change", () => {
    if (!radio.checked) return;
    if (!VALID_INSTAGRAM_MODES.includes(radio.value)) return;

    instagramStatus.textContent = "Saving…";

    chrome.storage.sync.set(
      { [INSTAGRAM_MODE_KEY]: radio.value },
      () => {
        if (chrome.runtime.lastError) {
          instagramStatus.textContent = "Couldn't save. Please try again.";
          return;
        }

        instagramStatus.textContent = describeInstagramMode(radio.value);
      }
    );
  });
});

loadSettings();