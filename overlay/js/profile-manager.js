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
    if ((key.match(/\|/g) || []).length !== 1) return false;
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
