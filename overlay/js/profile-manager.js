(() => {
  "use strict";

  const STORE = "sptProfilesV1";
  const ACTIVE = "sptActiveProfileV1";
  const ITEMS = "syncPairsTrackerItems";
  const BACKUP = "syncPairsTrackerBackup";
  const state = { profiles: {}, activeId: null, switching: false, timer: null };

  const readJSON = (key, fallback) => {
    try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); }
    catch { return fallback; }
  };
  const writeJSON = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const now = () => new Date().toISOString();
  const uid = () => globalThis.crypto?.randomUUID?.() || `profile_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const esc = (s) => String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");

  function isPairEntry(key, value) {
    if (typeof key !== "string" || typeof value !== "string") return false;
    if (!key.includes("|")) return false;
    const parts = value.split("|");
    return parts.length === 6 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1]) && /^\d+$/.test(parts[2]) && /^\d+$/.test(parts[4]) && /^\d+$/.test(parts[5]);
  }

  function capture() {
    const pairs = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const value = key ? localStorage.getItem(key) : null;
      if (key && isPairEntry(key, value)) pairs[key] = value;
    }
    return { pairs, items: readJSON(ITEMS, {}), backup: localStorage.getItem(BACKUP) || "", capturedAt: now() };
  }

  function clearNativeState() {
    const remove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const value = key ? localStorage.getItem(key) : null;
      if (key && isPairEntry(key, value)) remove.push(key);
    }
    remove.forEach(k => localStorage.removeItem(k));
    localStorage.removeItem(ITEMS);
    localStorage.removeItem(BACKUP);
  }

  function apply(snapshot) {
    clearNativeState();
    Object.entries(snapshot?.pairs || {}).forEach(([k,v]) => { if (isPairEntry(k,v)) localStorage.setItem(k,v); });
    writeJSON(ITEMS, snapshot?.items || {});
    if (snapshot?.backup) localStorage.setItem(BACKUP, snapshot.backup);
  }

  function persist() {
    writeJSON(STORE, { version: 1, profiles: state.profiles });
    if (state.activeId) localStorage.setItem(ACTIVE, state.activeId);
  }

  function load() {
    const data = readJSON(STORE, null);
    state.profiles = data?.version === 1 && data.profiles ? data.profiles : {};
    const wanted = localStorage.getItem(ACTIVE);
    state.activeId = wanted && state.profiles[wanted] ? wanted : Object.keys(state.profiles)[0] || null;
  }

  function addProfile(name, snapshot) {
    const id = uid(), stamp = now();
    state.profiles[id] = {
      id, name: String(name || "Profile").trim() || "Profile",
      createdAt: stamp, updatedAt: stamp,
      snapshot: snapshot || { pairs: {}, items: {}, backup: "", capturedAt: stamp }
    };
    return id;
  }

  function ensureFirst() {
    if (Object.keys(state.profiles).length) return;
    const current = capture();
    const hasData = Object.keys(current.pairs).length || Object.keys(current.items || {}).length || current.backup;
    state.activeId = addProfile(hasData ? "My profile" : "Profile 1", current);
    persist();
  }

  function save() {
    if (state.switching) return;
    const p = state.profiles[state.activeId];
    if (!p) return;
    p.snapshot = capture();
    p.updatedAt = now();
    persist();
    const count = document.querySelector("#sptProfileManager .spt-profile-count");
    if (count) count.textContent = `${Object.keys(p.snapshot.pairs || {}).length} sync pairs`;
  }

  function scheduleSave() {
    if (state.switching) return;
    clearTimeout(state.timer);
    state.timer = setTimeout(save, 200);
  }

  function switchTo(id) {
    if (!id || id === state.activeId || !state.profiles[id]) return;
    save(); state.switching = true; state.activeId = id;
    apply(state.profiles[id].snapshot); persist(); location.reload();
  }

  function create() {
    const name = prompt("Name of the new profile:", `Profile ${Object.keys(state.profiles).length + 1}`);
    if (name == null || !name.trim()) return;
    save(); state.switching = true;
    state.activeId = addProfile(name.trim());
    apply(state.profiles[state.activeId].snapshot); persist(); location.reload();
  }

  function rename() {
    const p = state.profiles[state.activeId]; if (!p) return;
    const name = prompt("New profile name:", p.name);
    if (name == null || !name.trim()) return;
    p.name = name.trim(); p.updatedAt = now(); persist(); render();
  }

  function duplicate() {
    save(); const p = state.profiles[state.activeId]; if (!p) return;
    state.switching = true;
    const copy = JSON.parse(JSON.stringify(p.snapshot));
    state.activeId = addProfile(`${p.name} copy`, copy);
    apply(copy); persist(); location.reload();
  }

  function remove() {
    const ids = Object.keys(state.profiles), p = state.profiles[state.activeId];
    if (!p) return;
    if (ids.length === 1) return alert("At least one profile must remain.");
    if (!confirm(`Delete profile \"${p.name}\"?`)) return;
    state.switching = true; delete state.profiles[state.activeId];
    state.activeId = ids.find(id => state.profiles[id]);
    apply(state.profiles[state.activeId].snapshot); persist(); location.reload();
  }

  function exportProfile() {
    save(); const p = state.profiles[state.activeId]; if (!p) return;
    const payload = { type:"sync-pairs-tracker-profile", version:1, exportedAt:now(), profile:p };
    const blob = new Blob([JSON.stringify(payload,null,2)], {type:"application/json"});
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = `${p.name.replace(/[^a-z0-9_-]+/gi,"_") || "profile"}.spt-profile.json`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  function importProfile(file) {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const data = JSON.parse(String(r.result || ""));
        if (data?.type !== "sync-pairs-tracker-profile" || data?.version !== 1 || !data?.profile?.snapshot) throw new Error();
        save(); state.switching = true;
        state.activeId = addProfile(data.profile.name || "Imported profile", data.profile.snapshot);
        apply(state.profiles[state.activeId].snapshot); persist(); location.reload();
      } catch { alert("Invalid Sync Pairs Tracker profile file."); }
    };
    r.readAsText(file);
  }

  function render() {
    document.getElementById("sptProfileManager")?.remove();
    const p = state.profiles[state.activeId]; if (!p) return;
    const root = document.createElement("section"); root.id = "sptProfileManager";
    root.innerHTML = `<button class="spt-profile-current" type="button"><span class="spt-profile-avatar">${esc(p.name[0] || "P")}</span><span class="spt-profile-current-copy"><small>PROFILE</small><strong>${esc(p.name)}</strong><span class="spt-profile-count">${Object.keys(p.snapshot?.pairs || {}).length} sync pairs</span></span><span>▾</span></button><div class="spt-profile-menu spt-profile-hidden"><div class="spt-profile-title">Profiles</div><div class="spt-profile-list"></div><div class="spt-profile-separator"></div><button class="spt-profile-action" data-a="create">＋ New profile</button><button class="spt-profile-action" data-a="rename">✎ Rename</button><button class="spt-profile-action" data-a="duplicate">⧉ Duplicate</button><button class="spt-profile-action" data-a="export">⇩ Export profile</button><button class="spt-profile-action" data-a="import">⇧ Import profile</button><button class="spt-profile-action spt-profile-danger" data-a="delete">× Delete profile</button><input class="spt-import" type="file" accept=".json,application/json" hidden></div>`;

    const host = document.getElementById("leftSideHead") || document.getElementById("options");
    if (host?.parentElement) host.insertAdjacentElement("afterend", root); else document.body.prepend(root);
    const list = root.querySelector(".spt-profile-list");
    Object.values(state.profiles).forEach(x => {
      const b = document.createElement("button"); b.type="button"; b.className="spt-profile-entry" + (x.id===state.activeId?" is-active":""); b.dataset.id=x.id;
      b.innerHTML=`<span class="spt-profile-avatar">${esc(x.name[0]||"P")}</span><span class="spt-profile-entry-copy"><strong>${esc(x.name)}</strong><small>${Object.keys(x.snapshot?.pairs||{}).length} sync pairs</small></span>${x.id===state.activeId?"✓":""}`; list.appendChild(b);
    });
    root.querySelector(".spt-profile-current").onclick = e => { e.stopPropagation(); root.querySelector(".spt-profile-menu").classList.toggle("spt-profile-hidden"); };
    list.onclick = e => { const b=e.target.closest("[data-id]"); if(b) switchTo(b.dataset.id); };
    root.querySelectorAll("[data-a]").forEach(b => b.onclick = () => ({create,rename,duplicate,export:exportProfile,delete:remove,import:()=>root.querySelector(".spt-import").click()})[b.dataset.a]?.());
    root.querySelector(".spt-import").onchange = e => { importProfile(e.target.files?.[0]); e.target.value=""; };
  }

  function init() {
    load(); ensureFirst(); save(); render();
    ["click","change","input","contextmenu"].forEach(ev => document.addEventListener(ev,scheduleSave,true));
    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") save(); });
    setInterval(save, 10000);
    document.addEventListener("click", e => { if(!e.target.closest("#sptProfileManager")) document.querySelector("#sptProfileManager .spt-profile-menu")?.classList.add("spt-profile-hidden"); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, {once:true}); else init();
  window.SyncPairsProfiles = { save, switchTo, create, getActive:()=>state.profiles[state.activeId]||null };
})();


/*-----------------------------------------------------------------------------
  PROFILE COMPARISON + NEW SINCE LAST VISIT
-----------------------------------------------------------------------------*/
(() => {
  "use strict";

  const PROFILE_STORE = "sptProfilesV1";
  const NEW_STORE = "sptNewSinceLastVisitV1";
  const catalogPromise = fetch("js/syncpairs.json", { cache: "no-store" })
    .then(r => {
      if (!r.ok) throw new Error("Unable to load sync pair catalog");
      return r.json();
    })
    .then(data => Array.isArray(data?.SYNCPAIRS) ? data.SYNCPAIRS : []);

  const esc = (s) => String(s ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");

  const readJSON = (key, fallback) => {
    try {
      const value = localStorage.getItem(key);
      return value == null ? fallback : JSON.parse(value);
    } catch {
      return fallback;
    }
  };

  const writeJSON = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const now = () => new Date().toISOString();

  function pairKey(pair) {
    return String(pair?.trainerName || "") + "|" + String(pair?.pokemonNumber || "");
  }

  function localDateKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  function isReleased(pair) {
    return !!pair?.releaseDate && pair.releaseDate <= localDateKey();
  }

  function getReleasedPairs(catalog) {
    return catalog.filter(isReleased);
  }

  function getProfiles() {
    const data = readJSON(PROFILE_STORE, null);
    return data?.version === 1 && data.profiles ? data.profiles : {};
  }

  function profileLabel(pair) {
    const trainer = pair?.trainerName || "Unknown Trainer";
    const pokemon = pair?.pokemonName || "Unknown Pokémon";
    const forms = Array.isArray(pair?.pokemonForm) && pair.pokemonForm.length
      ? " — " + pair.pokemonForm.join(", ")
      : "";
    return trainer + " — " + pokemon + forms;
  }

  function formatDate(value) {
    if (!value) return "";
    const parts = value.split("-");
    if (parts.length !== 3) return value;
    return parts[2] + "/" + parts[1] + "/" + parts[0];
  }

  function getNewState(catalog) {
    const released = getReleasedPairs(catalog);
    let state = readJSON(NEW_STORE, null);

    if (!state || state.version !== 1 || !state.initializedAt) {
      state = {
        version: 1,
        initializedAt: now(),
        lastVisitAt: now(),
        seenKeys: Object.fromEntries(released.map(pair => [pairKey(pair), true]))
      };
      writeJSON(NEW_STORE, state);
      return { state, newPairs: [] };
    }

    state.lastVisitAt = now();
    writeJSON(NEW_STORE, state);

    const newPairs = released.filter(pair => !state.seenKeys?.[pairKey(pair)]);
    return { state, newPairs };
  }

  async function getNewPairs() {
    const catalog = await catalogPromise;
    return getNewState(catalog).newPairs;
  }

  function markAllSeen() {
    catalogPromise.then(catalog => {
      const released = getReleasedPairs(catalog);
      const state = readJSON(NEW_STORE, null) || {
        version: 1,
        initializedAt: now(),
        seenKeys: {}
      };
      state.version = 1;
      state.seenKeys = state.seenKeys || {};
      released.forEach(pair => { state.seenKeys[pairKey(pair)] = true; });
      state.markedAt = now();
      state.lastVisitAt = now();
      writeJSON(NEW_STORE, state);
      updateNewCount(0);
      document.querySelector(".spt-modal-backdrop[data-spt-modal='new']")?.remove();
    }).catch(() => {});
  }

  function updateNewCount(value) {
    const badge = document.querySelector("[data-feature='new'] .spt-feature-badge");
    if (badge) badge.textContent = String(value);
  }

  function createModal(type, title) {
    document.querySelector(".spt-modal-backdrop[data-spt-modal='" + type + "']")?.remove();

    const backdrop = document.createElement("div");
    backdrop.className = "spt-modal-backdrop";
    backdrop.dataset.sptModal = type;
    backdrop.innerHTML = `
      <div class="spt-modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="spt-modal-head">
          <div>
            <small>SYNC PAIRS TRACKER</small>
            <h2>${esc(title)}</h2>
          </div>
          <button type="button" class="spt-modal-close" aria-label="Close">×</button>
        </div>
        <div class="spt-modal-body"></div>
      </div>`;

    document.body.appendChild(backdrop);

    const close = () => backdrop.remove();
    backdrop.querySelector(".spt-modal-close").onclick = close;
    backdrop.addEventListener("click", e => { if (e.target === backdrop) close(); });
    backdrop.querySelector(".spt-modal").addEventListener("click", e => e.stopPropagation());

    const onKey = e => {
      if (e.key === "Escape") {
        close();
        document.removeEventListener("keydown", onKey);
      }
    };
    document.addEventListener("keydown", onKey);

    return { backdrop, body: backdrop.querySelector(".spt-modal-body"), close };
  }

  async function openNewSinceLastVisit() {
    const modal = createModal("new", "New since your last visit");
    modal.body.innerHTML = '<div class="spt-loading">Loading Sync Pairs…</div>';

    try {
      const newPairs = await getNewPairs();
      updateNewCount(newPairs.length);

      const rows = newPairs
        .slice()
        .sort((a,b) => String(b.releaseDate).localeCompare(String(a.releaseDate)))
        .map(pair => `
          <div class="spt-new-row">
            <div class="spt-new-main">
              <strong>${esc(profileLabel(pair))}</strong>
              <small>Released ${esc(formatDate(pair.releaseDate))}</small>
            </div>
            <span class="spt-new-tag">NEW</span>
          </div>`)
        .join("");

      modal.body.innerHTML = `
        <div class="spt-new-summary">
          <strong>${newPairs.length}</strong>
          <span>new Sync Pair${newPairs.length === 1 ? "" : "s"}</span>
        </div>
        ${rows || '<div class="spt-empty">No new Sync Pairs since your last visit.</div>'}
        <div class="spt-modal-actions">
          <button type="button" class="spt-modal-btn spt-modal-primary" data-action="mark-seen">Mark all as seen</button>
          <button type="button" class="spt-modal-btn" data-action="close">Close</button>
        </div>`;

      modal.body.querySelector("[data-action='mark-seen']").onclick = markAllSeen;
      modal.body.querySelector("[data-action='close']").onclick = modal.close;
    } catch {
      modal.body.innerHTML = `
        <div class="spt-empty">Unable to load the Sync Pair catalog.</div>
        <div class="spt-modal-actions">
          <button type="button" class="spt-modal-btn" data-action="close">Close</button>
        </div>`;
      modal.body.querySelector("[data-action='close']").onclick = modal.close;
    }
  }

  function pairMap(catalog, profiles) {
    const map = new Map();
    getReleasedPairs(catalog).forEach(pair => map.set(pairKey(pair), pair));

    Object.values(profiles).forEach(profile => {
      Object.keys(profile?.snapshot?.pairs || {}).forEach(key => {
        if (!map.has(key)) {
          const separator = key.indexOf("|");
          const trainer = separator >= 0 ? key.slice(0, separator) : key;
          const pokemonNumber = separator >= 0 ? key.slice(separator + 1) : "";
          map.set(key, {
            trainerName: trainer,
            pokemonNumber,
            pokemonName: pokemonNumber ? "Pokémon #" + pokemonNumber : "Unknown Pokémon",
            releaseDate: ""
          });
        }
      });
    });

    return map;
  }

  function comparisonRows(catalog, profileA, profileB, filter) {
    const profiles = getProfiles();
    const map = pairMap(catalog, profiles);
    const pairsA = profileA?.snapshot?.pairs || {};
    const pairsB = profileB?.snapshot?.pairs || {};

    const rows = [];
    for (const [key, pair] of map) {
      const a = Object.prototype.hasOwnProperty.call(pairsA, key);
      const b = Object.prototype.hasOwnProperty.call(pairsB, key);
      const status = a && b ? "both" : a ? "onlyA" : b ? "onlyB" : "neither";
      if (filter !== "all" && filter !== status) continue;
      rows.push({ key, pair, status, label: profileLabel(pair) });
    }

    rows.sort((x,y) => {
      const byName = x.label.localeCompare(y.label, undefined, { sensitivity: "base" });
      if (byName) return byName;
      return String(x.pair.releaseDate).localeCompare(String(y.pair.releaseDate));
    });

    return rows;
  }

  function openCompare() {
    window.SyncPairsProfiles?.save?.();
    const profiles = getProfiles();
    const profileList = Object.values(profiles);

    if (profileList.length < 2) {
      alert("Create at least two profiles to compare them.");
      return;
    }

    const activeId = localStorage.getItem("sptActiveProfileV1");
    const firstA = profiles[activeId] ? activeId : profileList[0].id;
    const firstB = profileList.find(p => p.id !== firstA)?.id || profileList[1].id;

    const modal = createModal("compare", "Compare profiles");
    modal.body.innerHTML = `
      <div class="spt-compare-selectors">
        <label>Profile A<select data-role="profile-a">${profileList.map(p =>
          `<option value="${esc(p.id)}" ${p.id===firstA?"selected":""}>${esc(p.name)}</option>`).join("")}</select></label>
        <div class="spt-compare-vs">VS</div>
        <label>Profile B<select data-role="profile-b">${profileList.map(p =>
          `<option value="${esc(p.id)}" ${p.id===firstB?"selected":""}>${esc(p.name)}</option>`).join("")}</select></label>
      </div>
      <div class="spt-compare-content"><div class="spt-loading">Loading Sync Pairs…</div></div>`;

    const content = modal.body.querySelector(".spt-compare-content");
    const selectA = modal.body.querySelector("[data-role='profile-a']");
    const selectB = modal.body.querySelector("[data-role='profile-b']");
    let filter = "all";

    function render() {
      const currentProfiles = getProfiles();
      const a = currentProfiles[selectA.value];
      const b = currentProfiles[selectB.value];
      if (!a || !b) return;

      catalogPromise.then(catalog => {
        const map = pairMap(catalog, currentProfiles);
        const rows = comparisonRows(catalog, a, b, filter);

        let both = 0, onlyA = 0, onlyB = 0, neither = 0;
        for (const [key] of map) {
          const ownsA = Object.prototype.hasOwnProperty.call(a.snapshot?.pairs || {}, key);
          const ownsB = Object.prototype.hasOwnProperty.call(b.snapshot?.pairs || {}, key);
          if (ownsA && ownsB) both++;
          else if (ownsA) onlyA++;
          else if (ownsB) onlyB++;
          else neither++;
        }

        const stat = (key, label, value) => `
          <button type="button" class="spt-compare-stat ${filter===key?"is-active":""}" data-filter="${key}">
            <strong>${value}</strong><span>${esc(label)}</span>
          </button>`;

        const filters = `
          <div class="spt-compare-filters">
            <button type="button" class="spt-filter-chip ${filter==="all"?"is-active":""}" data-filter="all">Show all</button>
            <button type="button" class="spt-filter-chip ${filter==="both"?"is-active":""}" data-filter="both">Show common</button>
            <button type="button" class="spt-filter-chip ${filter==="onlyA"?"is-active":""}" data-filter="onlyA">Only ${esc(a.name)}</button>
            <button type="button" class="spt-filter-chip ${filter==="onlyB"?"is-active":""}" data-filter="onlyB">Only ${esc(b.name)}</button>
            <button type="button" class="spt-filter-chip ${filter==="neither"?"is-active":""}" data-filter="neither">Neither</button>
          </div>`;

        const rowsHtml = rows.map(row => {
          const statusLabel = row.status === "both"
            ? "Both own"
            : row.status === "onlyA"
              ? "Only " + a.name
              : row.status === "onlyB"
                ? "Only " + b.name
                : "Neither";

          return `
            <div class="spt-compare-row">
              <div class="spt-compare-pair">
                <strong>${esc(row.label)}</strong>
                <small>${row.pair.releaseDate ? "Released " + esc(formatDate(row.pair.releaseDate)) : "Legacy / unknown"}</small>
              </div>
              <span class="spt-compare-status status-${row.status}">${esc(statusLabel)}</span>
            </div>`;
        }).join("");

        content.innerHTML = `
          <div class="spt-compare-title">
            <strong>${esc(a.name)} vs ${esc(b.name)}</strong>
            <span>${rows.length} Duo${rows.length === 1 ? "" : "s"} shown</span>
          </div>
          <div class="spt-compare-stats">
            ${stat("both", "Both own", both)}
            ${stat("onlyA", "Only " + a.name, onlyA)}
            ${stat("onlyB", "Only " + b.name, onlyB)}
            ${stat("neither", "Neither", neither)}
          </div>
          ${filters}
          <div class="spt-compare-list">${rowsHtml || '<div class="spt-empty">No Sync Pairs match this filter.</div>'}</div>`;

        content.querySelectorAll("[data-filter]").forEach(button => {
          button.onclick = () => {
            filter = button.dataset.filter;
            render();
          };
        });
      }).catch(() => {
        content.innerHTML = '<div class="spt-empty">Unable to load the Sync Pair catalog.</div>';
      });
    }

    selectA.onchange = () => {
      if (selectA.value === selectB.value) {
        const replacement = profileList.find(p => p.id !== selectA.value);
        if (replacement) selectB.value = replacement.id;
      }
      filter = "all";
      render();
    };

    selectB.onchange = () => {
      if (selectB.value === selectA.value) {
        const replacement = profileList.find(p => p.id !== selectB.value);
        if (replacement) selectA.value = replacement.id;
      }
      filter = "all";
      render();
    };

    render();
  }

  function enhanceMenu() {
    const menu = document.querySelector("#sptProfileManager .spt-profile-menu");
    if (!menu || menu.querySelector("#spt-profile-features")) return;

    const separator = menu.querySelector(".spt-profile-separator");
    const group = document.createElement("div");
    group.id = "spt-profile-features";
    group.className = "spt-profile-feature-group";
    group.innerHTML = `
      <button type="button" class="spt-profile-action" data-feature="compare">⇄ Compare profiles</button>
      <button type="button" class="spt-profile-action" data-feature="new">✦ New since last visit <span class="spt-feature-badge">0</span></button>`;

    if (separator) separator.insertAdjacentElement("beforebegin", group);
    else menu.prepend(group);

    group.querySelector("[data-feature='compare']").onclick = e => {
      e.stopPropagation();
      openCompare();
    };
    group.querySelector("[data-feature='new']").onclick = e => {
      e.stopPropagation();
      openNewSinceLastVisit();
    };

    refreshNewCount();
  }

  async function refreshNewCount() {
    try {
      const count = (await getNewPairs()).length;
      updateNewCount(count);
    } catch {}
  }

  function initFeatures() {
    enhanceMenu();

    const observer = new MutationObserver(() => {
      enhanceMenu();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    refreshNewCount();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initFeatures, { once: true });
  } else {
    initFeatures();
  }
})();
