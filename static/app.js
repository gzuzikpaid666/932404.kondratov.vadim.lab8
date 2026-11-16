(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const h = (tag, props = {}, ...kids) => { const el = Object.assign(document.createElement(tag), props); el.append(...kids); return el; };
  const st = { q: "", tags: new Set(), sort: "date_desc", view: localStorage.getItem("view") === "list" ? "list" : "grid", editingId: null, deletingId: null };
  let items = [];

  async function api(url, opt) {
    const r = await fetch(url, opt);
    if (!r.ok) {
      const d = (await r.json().catch(() => ({}))).detail;
      throw new Error(Array.isArray(d) ? d.map((x) => x.msg).join("; ") : d || `Ошибка ${r.status}`);
    }
    return r.status === 204 ? null : r.json();
  }
  const send = (method, body) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const fmtDate = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("ru-RU", { year: "numeric", month: "long", day: "numeric" }); };
  const split = (s) => s.split(",").map((t) => t.trim()).filter(Boolean);
  const safeUrl = (u) => /^https?:\/\//i.test(u) ? u : null;

  async function load() {
    const tags = await api("/api/tags");
    const known = new Set(tags.map((t) => t.name));
    st.tags.forEach((t) => known.has(t) || st.tags.delete(t));
    const p = new URLSearchParams({ q: st.q, tags: [...st.tags].join(","), sort: st.sort });
    items = await api(`/api/projects?${p}`);
    renderTags(tags); renderStack(tags); renderList();
  }

  function chip(tag, onClick, pressed) {
    return h("button", { type: "button", className: "chip", textContent: tag, onclick: onClick, ariaPressed: String(pressed) });
  }
  const toggleTag = (name) => { st.tags.has(name) ? st.tags.delete(name) : st.tags.add(name); load(); };

  function renderTags(tags) {
    $("#tags").replaceChildren(...tags.map((t) => chip(`${t.name} (${t.count})`, () => toggleTag(t.name), st.tags.has(t.name))));
    $("#reset").hidden = !(st.q || st.tags.size);
  }
  function renderStack(tags) {
    $("#stack").replaceChildren(...tags.map((t) => h("li", {}, chip(`${t.name} (${t.count})`, () => { st.tags = new Set([t.name]); selectTab("projects"); load(); }, false))));
  }

  function card(p) {
    const link = safeUrl(p.link);
    return h("li", { className: "card" }, h("article", {},
      h("div", { className: "body" },
        h("h3", { textContent: p.title }),
        h("time", { dateTime: p.date, textContent: fmtDate(p.date) }),
        ...(p.description ? [h("p", { textContent: p.description })] : []),
        h("ul", { className: "chips" }, ...split(p.tech_stack).map((t) => h("li", {}, chip(t, () => toggleTag(t), st.tags.has(t)))))),
      h("div", { className: "actions" },
        ...(link ? [h("a", { href: link, target: "_blank", rel: "noopener noreferrer", textContent: "Открыть проект" })] : [h("span", { style: "margin-right:auto" })]),
        h("button", { className: "btn", type: "button", textContent: "Изменить", ariaLabel: `Изменить: ${p.title}`, onclick: () => openForm(p) }),
        h("button", { className: "btn", type: "button", textContent: "Удалить", ariaLabel: `Удалить: ${p.title}`, onclick: () => askDelete(p) }))));
  }

  function renderList() {
    const list = $("#list");
    list.className = `cards ${st.view}`;
    document.querySelectorAll("[data-view]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === st.view)));
    $("#count").textContent = `Найдено проектов: ${items.length}`;
    if (items.length) return list.replaceChildren(...items.map(card));
    const filtered = st.q || st.tags.size;
    list.replaceChildren(h("li", { className: "empty" },
      h("p", { textContent: filtered ? "По запросу ничего не найдено. Измените поиск или сбросьте фильтры." : "Пока нет проектов. Добавьте первый." }),
      filtered ? h("button", { className: "btn", type: "button", textContent: "Сбросить фильтры", onclick: resetFilters })
               : h("button", { className: "btn primary", type: "button", textContent: "Добавить проект", onclick: () => openForm() })));
  }
  function resetFilters() { st.q = ""; st.tags.clear(); $("#q").value = ""; load(); }

  const dlg = $("#dlg"), form = $("#form");
  function openForm(p) {
    st.editingId = p ? p.id : null;
    $("#dlg-title").textContent = p ? "Изменить проект" : "Новый проект";
    form.reset(); $("#err").textContent = "";
    form.date.value = p ? p.date : new Date().toISOString().slice(0, 10);
    if (p) for (const k of ["title", "description", "tech_stack", "link"]) form[k].value = p[k];
    dlg.showModal(); form.title.focus();
  }
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(form));
    try {
      await (st.editingId ? api(`/api/projects/${st.editingId}`, send("PUT", body)) : api("/api/projects", send("POST", body)));
      dlg.close(); await load();
    } catch (err) { $("#err").textContent = err.message; }
  });
  $("#cancel").onclick = () => dlg.close();
  $("#add").onclick = () => openForm();

  const del = $("#del");
  function askDelete(p) { st.deletingId = p.id; $("#del-name").textContent = p.title; del.showModal(); }
  del.addEventListener("close", async () => {
    if (del.returnValue !== "ok") return;
    try { await api(`/api/projects/${st.deletingId}`, { method: "DELETE" }); await load(); }
    catch (err) { $("#count").textContent = err.message; }
  });
  [dlg, del].forEach((d) => d.addEventListener("click", (e) => { if (e.target === d) d.close(); }));

  let timer;
  $("#q").addEventListener("input", (e) => { clearTimeout(timer); timer = setTimeout(() => { st.q = e.target.value; load(); }, 250); });
  $("#sort").addEventListener("change", (e) => { st.sort = e.target.value; load(); });
  $("#reset").onclick = resetFilters;
  document.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => { st.view = b.dataset.view; localStorage.setItem("view", st.view); renderList(); }));

  const tabs = [...document.querySelectorAll("[role=tab]")];
  function selectTab(name) {
    tabs.forEach((t) => {
      const on = t.id === `tab-${name}`;
      t.setAttribute("aria-selected", String(on)); t.tabIndex = on ? 0 : -1;
      $(`#${t.getAttribute("aria-controls")}`).hidden = !on;
    });
  }
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => selectTab(t.id.slice(4)));
    t.addEventListener("keydown", (e) => {
      if (!["ArrowRight", "ArrowLeft"].includes(e.key)) return;
      const n = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
      n.focus(); selectTab(n.id.slice(4));
    });
  });

  load().catch((err) => { $("#count").textContent = err.message; });
})();
