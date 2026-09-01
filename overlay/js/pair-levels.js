(() => {
  "use strict";

  const LEVEL_STORE = "sptPairLevelsV1";
  const PROFILE_STORE = "sptProfilesV1";
  const ACTIVE_PROFILE = "sptActiveProfileV1";
  const PENDING_DUPLICATE = "sptPairLevelsDuplicateFromV1";
  const NORMAL_LEVELS = [1, 100, 140, 150, 180, 200];
  const EGG_LEVELS = [1, 100, 140, 150];

  const readJSON = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  };

  const writeJSON = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const activeProfileId = () => localStorage.getItem(ACTIVE_PROFILE) || "legacy";

  function readLevelStore() {
    const value = readJSON(LEVEL_STORE, {});
    return value && typeof value === "object" ? value : {};
  }

  function getProfileLevels() {
    const all = readLevelStore();
    return all[activeProfileId()] || {};
  }

  function getLevel(pairKey) {
    const value = getProfileLevels()[pairKey];
    return Number.isInteger(value) ? value : null;
  }

  function setLevel(pairKey, value) {
    const all = readLevelStore();
    const id = activeProfileId();
    all[id] ||= {};

    if (value == null) delete all[id][pairKey];
    else all[id][pairKey] = value;

    writeJSON(LEVEL_STORE, all);
    refreshAll();
  }

  function pairKey(card) {
    const trainer = card.querySelector(".infoTrainerName")?.textContent?.trim();
    const pokemon = card.querySelector(".infoPokemonNum")?.textContent?.trim();
    return trainer && pokemon ? `${trainer}|${pokemon}` : null;
  }

  function pairLabel(card) {
    const trainer = card.querySelector(".infoTrainerName")?.textContent?.trim() || "Sync Pair";
    const pokemon = card.querySelector(".infoPokemonName")?.childNodes?.[0]?.textContent?.trim() ||
      card.querySelector(".infoPokemonName")?.textContent?.trim() || "";
    return pokemon ? `${trainer} & ${pokemon}` : trainer;
  }

  function isEggMode() {
    return document.getElementById("syncPairs")?.classList.contains("modeEgg") ||
      document.getElementById("btnEggs")?.classList.contains("btnEggsON") || false;
  }

  function levelSteps() {
    return isEggMode() ? EGG_LEVELS : NORMAL_LEVELS;
  }

  function nextLevel(current) {
    const steps = levelSteps();
    if (current == null) return steps[0];

    const exact = steps.indexOf(current);
    if (exact >= 0) return steps[(exact + 1) % steps.length];

    // Keeps old freely-entered values usable: 137 -> 140, 153 -> 180, etc.
    return steps.find(level => level > current) ?? steps[0];
  }

  function decorate(card) {
    if (card.querySelector(":scope > .spt-pair-level")) return;
    const key = pairKey(card);
    if (!key) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "spt-pair-level";
    button.dataset.pairKey = key;
    button.innerHTML = '<span class="spt-level-prefix">Nv.</span><span class="spt-level-value">—</span>';

    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      const current = getLevel(key);
      setLevel(key, nextLevel(current));
    });

    card.appendChild(button);
  }

  function refreshCard(card) {
    decorate(card);
    const button = card.querySelector(":scope > .spt-pair-level");
    if (!button) return;

    const selected = card.classList.contains("selected");
    button.hidden = !selected;
    if (!selected) return;

    const key = pairKey(card);
    const level = key ? getLevel(key) : null;
    const value = button.querySelector(".spt-level-value");
    if (value) value.textContent = level == null ? "—" : String(level);

    button.classList.toggle("is-unset", level == null);
    button.setAttribute(
      "aria-label",
      `${pairLabel(card)}: ${level == null ? "level not set" : `level ${level}`}. Click for next level.`
    );
    button.title = `${level == null ? "Niveau non défini" : `Nv. ${level}`} — cliquer pour passer au palier suivant`;
  }

  let refreshFrame = 0;
  function refreshAll() {
    if (refreshFrame) return;
    refreshFrame = requestAnimationFrame(() => {
      refreshFrame = 0;
      document.querySelectorAll(".syncPair").forEach(refreshCard);
    });
  }

  function copyLevelsAfterDuplicate() {
    const sourceId = sessionStorage.getItem(PENDING_DUPLICATE);
    if (!sourceId) return;
    const currentId = activeProfileId();
    if (currentId === sourceId) return;

    const all = readLevelStore();
    if (all[sourceId] && !all[currentId]) {
      all[currentId] = JSON.parse(JSON.stringify(all[sourceId]));
      writeJSON(LEVEL_STORE, all);
    }
    sessionStorage.removeItem(PENDING_DUPLICATE);
  }

  function cleanupDeletedProfiles() {
    const profiles = readJSON(PROFILE_STORE, null)?.profiles;
    if (!profiles || typeof profiles !== "object") return;
    const all = readLevelStore();
    let changed = false;
    Object.keys(all).forEach(id => {
      if (id !== "legacy" && !profiles[id]) {
        delete all[id];
        changed = true;
      }
    });
    if (changed) writeJSON(LEVEL_STORE, all);
  }

  function enhanceProfileTransfer() {
    document.addEventListener("click", event => {
      const action = event.target.closest("#sptProfileManager [data-a]")?.dataset.a;
      if (action === "duplicate") {
        sessionStorage.setItem(PENDING_DUPLICATE, activeProfileId());
      }
      if (action === "export") {
        event.preventDefault();
        event.stopImmediatePropagation();
        exportEnhancedProfile();
      }
    }, true);

    document.addEventListener("change", event => {
      const input = event.target.closest("#sptProfileManager .spt-import");
      if (!input) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const file = input.files?.[0];
      input.value = "";
      if (file) importEnhancedProfile(file);
    }, true);
  }

  function exportEnhancedProfile() {
    window.SyncPairsProfiles?.save?.();
    const manager = readJSON(PROFILE_STORE, null);
    const id = activeProfileId();
    const profile = manager?.profiles?.[id];
    if (!profile) return;

    const allLevels = readLevelStore();
    const payload = {
      type: "sync-pairs-tracker-profile",
      version: 1,
      exportedAt: new Date().toISOString(),
      profile: {
        ...profile,
        pairLevels: allLevels[id] || {}
      }
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${profile.name.replace(/[^a-z0-9_-]+/gi, "_") || "profile"}.spt-profile.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function applyNativeSnapshot(snapshot) {
    const isNativePair = (key, value) => {
      if (typeof key !== "string" || typeof value !== "string") return false;
      if ((key.match(/\|/g) || []).length !== 1) return false;
      const parts = value.split("|");
      return parts.length === 6 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1]) && /^\d+$/.test(parts[2]) && /^\d+$/.test(parts[4]) && /^\d+$/.test(parts[5]);
    };

    const remove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const value = key ? localStorage.getItem(key) : null;
      if (key && isNativePair(key, value)) remove.push(key);
    }
    remove.forEach(key => localStorage.removeItem(key));
    localStorage.removeItem("syncPairsTrackerItems");
    localStorage.removeItem("syncPairsTrackerBackup");

    Object.entries(snapshot?.pairs || {}).forEach(([key, value]) => {
      if (isNativePair(key, value)) localStorage.setItem(key, value);
    });
    writeJSON("syncPairsTrackerItems", snapshot?.items || {});
    if (snapshot?.backup) localStorage.setItem("syncPairsTrackerBackup", snapshot.backup);
  }

  function importEnhancedProfile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result || ""));
        if (data?.type !== "sync-pairs-tracker-profile" || data?.version !== 1 || !data?.profile?.snapshot) {
          throw new Error("Invalid profile");
        }

        window.SyncPairsProfiles?.save?.();
        const manager = readJSON(PROFILE_STORE, { version: 1, profiles: {} });
        const id = globalThis.crypto?.randomUUID?.() || `profile_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const stamp = new Date().toISOString();
        manager.version = 1;
        manager.profiles ||= {};
        manager.profiles[id] = {
          id,
          name: data.profile.name || "Imported profile",
          createdAt: stamp,
          updatedAt: stamp,
          snapshot: data.profile.snapshot
        };
        writeJSON(PROFILE_STORE, manager);
        localStorage.setItem(ACTIVE_PROFILE, id);

        const allLevels = readLevelStore();
        allLevels[id] = data.profile.pairLevels || {};
        writeJSON(LEVEL_STORE, allLevels);
        applyNativeSnapshot(data.profile.snapshot);
        location.reload();
      } catch (error) {
        console.error(error);
        alert("Invalid Sync Pairs Tracker profile file.");
      }
    };
    reader.readAsText(file);
  }

  function observeTracker() {
    const observer = new MutationObserver(refreshAll);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"]
    });
  }

  function init() {
    copyLevelsAfterDuplicate();
    cleanupDeletedProfiles();
    enhanceProfileTransfer();
    refreshAll();
    observeTracker();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();

  window.SyncPairsLevels = {
    get: getLevel,
    set: setLevel,
    next: current => nextLevel(current),
    refresh: refreshAll
  };
})();