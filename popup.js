"use strict";

const MODE_KEY = "shortblockMode";
const VALID_MODES = ["off", "first", "all"];

const status = document.getElementById("status");
const radios = document.querySelectorAll('input[name="mode"]');

function describeMode(mode) {
  return {
    off: "Shorts blocking is off.",
    first: "The first-scroll interruption is enabled.",
    all: "All Shorts blocking is enabled."
  }[mode] || "Settings saved.";
}

chrome.storage.sync.get({ [MODE_KEY]: "first" }, result => {
  const mode = VALID_MODES.includes(result[MODE_KEY])
    ? result[MODE_KEY]
    : "first";

  const selected = document.querySelector(
    `input[name="mode"][value="${mode}"]`
  );

  if (selected) selected.checked = true;
  status.textContent = describeMode(mode);
});

radios.forEach(radio => {
  radio.addEventListener("change", () => {
    if (!radio.checked) return;

    const mode = radio.value;
    if (!VALID_MODES.includes(mode)) return;

    status.textContent = "Saving…";

    chrome.storage.sync.set({ [MODE_KEY]: mode }, () => {
      if (chrome.runtime.lastError) {
        status.textContent = "Couldn't save. Please try again.";
        return;
      }

      status.textContent = describeMode(mode);
    });
  });
});