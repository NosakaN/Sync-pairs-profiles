(() => {
  "use strict";

  const LEVEL_STORE = "sptPairLevelsV1";
  const ACTIVE_PROFILE = "sptActiveProfileV1";

  const readJSON = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  };

  function activeProfileId() {
    return localStorage.getItem(ACTIVE_PROFILE) || "legacy";
  }

  function isNativePairEntry(key, value) {
    if (typeof key !== "string" || typeof value !== "string") return false;
    if ((key.match(/\|/g) || []).length !== 1) return false;
    const parts = value.split("|");
    return parts.length === 6 &&
      /^\d+$/.test(parts[0]) &&
      /^\d+$/.test(parts[1]) &&
      /^\d+$/.test(parts[2]) &&
      /^\d+$/.test(parts[4]) &&
      /^\d+$/.test(parts[5]);
  }

  function getOwnedPairKeys() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const value = key ? localStorage.getItem(key) : null;
      if (key && isNativePairEntry(key, value)) keys.push(key);
    }
    return keys;
  }

  function setAllOwnedTo140() {
    const keys = getOwnedPairKeys();
    if (!keys.length) {
      alert("No owned Sync Pairs were found in this profile.");
      return;
    }

    const ok = confirm(
      `Set all ${keys.length} owned Sync Pairs to N.140?\n\nThis will replace any levels already set for those Sync Pairs.`
    );
    if (!ok) return;

    const all = readJSON(LEVEL_STORE, {});
    const id = activeProfileId();
    all[id] ||= {};
    keys.forEach(key => {
      all[id][key] = 140;
    });
    localStorage.setItem(LEVEL_STORE, JSON.stringify(all));

    window.SyncPairsLevels?.refresh?.();
    alert(`${keys.length} Sync Pairs are now N.140.`);
  }

  function ensureButton() {
    const menu = document.querySelector("#sptProfileManager .spt-profile-menu");
    if (!menu || menu.querySelector('[data-spt-level-bulk="140"]')) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "spt-profile-action";
    button.dataset.sptLevelBulk = "140";
    button.textContent = "⇧ Set all to N.140";
    button.title = "Set every owned Sync Pair in this profile to N.140";
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      setAllOwnedTo140();
    });

    const separator = menu.querySelector(".spt-profile-separator");
    if (separator) separator.insertAdjacentElement("afterend", button);
    else menu.prepend(button);
  }

  function init() {
    ensureButton();
    const observer = new MutationObserver(ensureButton);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  window.SyncPairsLevelBulk = {
    setAllOwnedTo140
  };
})();