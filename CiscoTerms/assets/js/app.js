(() => {
  "use strict";

  const database = window.CISCO_TERMS;
  if (!database || !Array.isArray(database.entries)) {
    document.body.innerHTML = '<main style="padding:2rem;font-family:Arial" dir="rtl"><h1>تعذر تحميل قاعدة المصطلحات</h1><p>تأكد من وجود ملف البيانات داخل مجلد data.</p></main>';
    return;
  }

  const entries = database.entries;
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const STORAGE = { favorites: "cisco_terms_favorites_v1", recent: "cisco_terms_recent_v1", theme: "cisco_terms_theme_v1" };
  const PAGE_SIZE = 40;
  const categoryAr = {
    "Automation & Programmability": "الأتمتة والبرمجة",
    "Ethernet Switching": "إيثرنت والتحويل",
    "IP Addressing & Subnetting": "العنونة وتقسيم الشبكات",
    "IP Routing": "توجيه IP",
    "IPv6": "IPv6",
    "Network Fundamentals": "أساسيات الشبكات",
    "Network Services": "خدمات الشبكة",
    "OSPF": "OSPF",
    "Operations & Management": "التشغيل والإدارة",
    "Physical Infrastructure": "البنية الفيزيائية",
    "Security": "الأمن",
    "WAN": "الشبكات الواسعة",
    "Wireless": "الشبكات اللاسلكية"
  };
  const typeAr = {
    PROTOCOL: "بروتوكول", DEVICE_OR_ROLE: "جهاز أو دور", ABBREVIATION: "اختصار",
    STANDARD: "معيار", MESSAGE_OR_STRUCTURE: "رسالة أو بنية", CONCEPT: "مفهوم",
    ADDRESSING: "عنونة", STATE_OR_MODE: "حالة أو وضع"
  };

  const el = (id) => document.getElementById(id);
  const ui = {
    search: el("searchInput"), clearSearch: el("clearSearch"), searchCard: document.querySelector(".search-card"),
    category: el("categoryFilter"), type: el("typeFilter"), abbreviationOnly: el("abbreviationOnly"),
    favoritesFilter: el("favoritesFilter"), resetFilters: el("resetFilters"), alphabet: el("alphabetFilter"),
    sort: el("sortSelect"), count: el("resultCount"), results: el("resultsList"), loadMore: el("loadMore"),
    empty: el("emptyState"), emptyReset: el("emptyReset"), detailPanel: el("detailPanel"), detail: el("detailContent"),
    closeDetails: el("closeDetails"), backdrop: el("mobileBackdrop"), recentWrap: el("recentWrap"),
    recent: el("recentTerms"), theme: el("themeToggle"), total: el("totalTerms"), toast: el("toast")
  };

  let favorites = new Set(readStorage(STORAGE.favorites, []));
  let recent = readStorage(STORAGE.recent, []).filter((id) => byId.has(id)).slice(0, 6);
  let filtered = [];
  let selectedId = null;
  let limit = PAGE_SIZE;
  let activeLetter = "";
  let favoritesOnly = false;
  let toastTimer;

  function readStorage(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  }
  function writeStorage(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
  }
  function normalize(value = "") {
    return String(value).toLowerCase()
      .normalize("NFKD").replace(/[\u064B-\u065F\u0670\u0640]/g, "")
      .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ؤ/g, "و").replace(/ئ/g, "ي")
      .replace(/[‐‑‒–—−_./\\()\[\]]/g, " ").replace(/\s+/g, " ").trim();
  }
  function compact(value = "") { return normalize(value).replace(/\s/g, ""); }
  function indexEntry(entry) {
    const aliases = (entry.aliases_en || []).join(" ");
    return {
      ...entry,
      _abbr: normalize(entry.abbreviation), _abbrCompact: compact(entry.abbreviation),
      _en: normalize(`${entry.term_en} ${entry.full_form_en || ""}`),
      _enCompact: compact(`${entry.term_en} ${entry.full_form_en || ""}`),
      _ar: normalize(entry.term_ar), _aliases: normalize(aliases), _definition: normalize(entry.definition_ar)
    };
  }
  const indexed = entries.map(indexEntry);

  function score(entry, query) {
    if (!query) return 0;
    const q = normalize(query), qc = compact(query);
    if (entry._abbr && (entry._abbr === q || entry._abbrCompact === qc)) return 1200;
    if (normalize(entry.term_en) === q || compact(entry.term_en) === qc) return 1100;
    if (entry._en === q || entry._enCompact === qc) return 1050;
    if (entry._ar === q) return 1000;
    if (entry._abbr.startsWith(q) || entry._en.startsWith(q)) return 850;
    if (entry._ar.startsWith(q)) return 800;
    if (entry._aliases.includes(q)) return 650;
    if (entry._en.includes(q) || entry._enCompact.includes(qc)) return 600;
    if (entry._ar.includes(q)) return 550;
    if (q.length >= 3 && entry._definition.includes(q)) return 180;
    return -1;
  }

  function fillFilters() {
    [...new Set(entries.map((e) => e.category))].sort().forEach((category) => {
      const option = document.createElement("option"); option.value = category; option.textContent = categoryAr[category] || category; ui.category.append(option);
    });
    [...new Set(entries.map((e) => e.type))].sort().forEach((type) => {
      const option = document.createElement("option"); option.value = type; option.textContent = typeAr[type] || type; ui.type.append(option);
    });
    [{ value: "", label: "الكل" }, ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((x) => ({ value: x, label: x }))].forEach(({ value, label }, index) => {
      const button = document.createElement("button"); button.type = "button"; button.textContent = label; button.dataset.letter = value;
      button.classList.toggle("active", index === 0); button.setAttribute("aria-pressed", index === 0 ? "true" : "false"); ui.alphabet.append(button);
    });
  }

  function applyFilters({ preserveSelection = false } = {}) {
    const query = ui.search.value.trim();
    filtered = indexed.map((entry) => ({ entry, rank: score(entry, query) })).filter(({ entry, rank }) => {
      if (query && rank < 0) return false;
      if (ui.category.value && entry.category !== ui.category.value) return false;
      if (ui.type.value && entry.type !== ui.type.value) return false;
      if (ui.abbreviationOnly.checked && !entry.abbreviation) return false;
      if (favoritesOnly && !favorites.has(entry.id)) return false;
      if (activeLetter && !String(entry.term_en).toUpperCase().startsWith(activeLetter)) return false;
      return true;
    });

    const collatorAr = new Intl.Collator("ar", { sensitivity: "base" });
    const collatorEn = new Intl.Collator("en", { sensitivity: "base" });
    filtered.sort((a, b) => {
      if (ui.sort.value === "ar") return collatorAr.compare(a.entry.term_ar, b.entry.term_ar);
      if (ui.sort.value === "en") return collatorEn.compare(a.entry.term_en, b.entry.term_en);
      return (b.rank - a.rank) || collatorEn.compare(a.entry.term_en, b.entry.term_en);
    });

    limit = PAGE_SIZE;
    ui.searchCard.classList.toggle("has-query", Boolean(query));
    ui.count.textContent = filtered.length.toLocaleString("ar-SA");
    if (!preserveSelection && filtered.length && !filtered.some(({ entry }) => entry.id === selectedId)) selectedId = filtered[0].entry.id;
    if (!filtered.length) selectedId = null;
    renderResults(); renderDetail();
  }

  function displayName(entry) { return entry.abbreviation || entry.term_en; }
  function renderResults() {
    ui.results.replaceChildren();
    const fragment = document.createDocumentFragment();
    filtered.slice(0, limit).forEach(({ entry }) => {
      const button = document.createElement("button"); button.type = "button"; button.className = "term-row"; button.dataset.id = entry.id;
      button.setAttribute("role", "option"); button.setAttribute("aria-selected", entry.id === selectedId ? "true" : "false");
      const main = document.createElement("span"); main.className = "term-row__main";
      const top = document.createElement("span"); top.className = "term-row__top";
      if (entry.abbreviation) { const abbr = document.createElement("bdi"); abbr.className = "term-row__abbr"; abbr.textContent = entry.abbreviation; top.append(abbr); }
      const en = document.createElement("bdi"); en.className = "term-row__en"; en.textContent = entry.full_form_en || entry.term_en; top.append(en);
      const ar = document.createElement("span"); ar.className = "term-row__ar"; ar.textContent = entry.term_ar;
      main.append(top, ar);
      const category = document.createElement("span"); category.className = "term-row__category"; category.textContent = categoryAr[entry.category] || entry.category;
      button.append(main, category); fragment.append(button);
    });
    ui.results.append(fragment);
    ui.empty.hidden = filtered.length > 0;
    ui.loadMore.hidden = filtered.length <= limit;
  }

  function addText(parent, tag, className, text) {
    const node = document.createElement(tag); if (className) node.className = className; node.textContent = text; parent.append(node); return node;
  }
  function renderDetail() {
    ui.detail.replaceChildren();
    const entry = selectedId ? byId.get(selectedId) : null;
    if (!entry) {
      const box = document.createElement("div"); box.className = "detail-placeholder";
      addText(box, "span", "", "⌕"); addText(box, "h2", "", "اختر مصطلحًا"); addText(box, "p", "", "ستظهر هنا الترجمة والتعريف والمصدر بصورة مختصرة وواضحة."); ui.detail.append(box); return;
    }
    const head = document.createElement("div"); head.className = "detail-head";
    const titles = document.createElement("div"); titles.className = "detail-head__title";
    addText(titles, "bdi", "detail-abbr", displayName(entry));
    const fullName = entry.full_form_en && normalize(entry.full_form_en) !== normalize(displayName(entry)) ? entry.full_form_en : entry.term_en;
    addText(titles, "p", "detail-en", fullName);
    const fav = document.createElement("button"); fav.type = "button"; fav.className = `favorite-button${favorites.has(entry.id) ? " active" : ""}`;
    fav.dataset.action = "favorite"; fav.textContent = favorites.has(entry.id) ? "★" : "☆"; fav.setAttribute("aria-label", favorites.has(entry.id) ? "إزالة من المفضلة" : "إضافة إلى المفضلة");
    head.append(titles, fav); ui.detail.append(head);
    addText(ui.detail, "h2", "detail-ar", entry.term_ar);
    addText(ui.detail, "p", "detail-definition", entry.definition_ar);
    const tags = document.createElement("div"); tags.className = "detail-tags";
    addText(tags, "span", "detail-tag", categoryAr[entry.category] || entry.category);
    addText(tags, "span", "detail-tag detail-tag--type", typeAr[entry.type] || entry.type); ui.detail.append(tags);
    const actions = document.createElement("div"); actions.className = "detail-actions";
    [["copy", "نسخ التعريف"], ["share", "مشاركة"]].forEach(([action, label]) => { const b = document.createElement("button"); b.type = "button"; b.dataset.action = action; b.textContent = label; actions.append(b); }); ui.detail.append(actions);
    const details = document.createElement("details"); details.className = "detail-meta";
    addText(details, "summary", "", "المصدر والأسماء البديلة");
    const meta = document.createElement("div"); meta.className = "detail-meta__body";
    if (entry.aliases_en?.length) {
      const row = document.createElement("div"); row.className = "detail-meta__row"; addText(row, "strong", "", "أسماء بديلة"); addText(row, "bdi", "", entry.aliases_en.join(" · ")); meta.append(row);
    }
    const sourceRow = document.createElement("div"); sourceRow.className = "detail-meta__row"; addText(sourceRow, "strong", "", "المصدر");
    const sourceList = document.createElement("ul"); sourceList.className = "source-list";
    (entry.sources || []).forEach((source) => addText(sourceList, "li", "", `المجلد ${source.volume} — الصفحة ${source.printed_page || source.pdf_page}`)); sourceRow.append(sourceList); meta.append(sourceRow);
    details.append(meta); ui.detail.append(details);
  }

  function selectTerm(id, { openMobile = true } = {}) {
    if (!byId.has(id)) return;
    selectedId = id; recent = [id, ...recent.filter((item) => item !== id)].slice(0, 6); writeStorage(STORAGE.recent, recent);
    renderResults(); renderDetail(); renderRecent();
    if (openMobile && matchMedia("(max-width: 850px)").matches) openMobileDetails();
  }
  function openMobileDetails() { ui.detailPanel.classList.add("mobile-open"); ui.backdrop.hidden = false; document.body.classList.add("details-open"); ui.closeDetails.focus(); }
  function closeMobileDetails() { ui.detailPanel.classList.remove("mobile-open"); ui.backdrop.hidden = true; document.body.classList.remove("details-open"); }
  function renderRecent() {
    ui.recent.replaceChildren(); ui.recentWrap.hidden = recent.length === 0;
    recent.forEach((id) => { const entry = byId.get(id); if (!entry) return; const b = document.createElement("button"); b.type = "button"; b.dataset.id = id; b.textContent = displayName(entry); ui.recent.append(b); });
  }
  function toggleFavorite(id) {
    if (favorites.has(id)) favorites.delete(id); else favorites.add(id);
    writeStorage(STORAGE.favorites, [...favorites]); renderDetail(); if (favoritesOnly) applyFilters({ preserveSelection: true });
    showToast(favorites.has(id) ? "أُضيف إلى المفضلة" : "أُزيل من المفضلة");
  }
  function copyEntry(entry) {
    const text = `${displayName(entry)} — ${entry.term_ar}: ${entry.definition_ar}`;
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => showToast("تم نسخ التعريف")).catch(() => fallbackCopy(text)); else fallbackCopy(text);
  }
  function fallbackCopy(text) { const area = document.createElement("textarea"); area.value = text; area.style.position = "fixed"; area.style.opacity = "0"; document.body.append(area); area.select(); document.execCommand("copy"); area.remove(); showToast("تم نسخ التعريف"); }
  function shareEntry(entry) {
    const text = `${displayName(entry)} — ${entry.term_ar}: ${entry.definition_ar}`;
    if (navigator.share) navigator.share({ title: displayName(entry), text }).catch(() => {}); else copyEntry(entry);
  }
  function showToast(message) { clearTimeout(toastTimer); ui.toast.textContent = message; ui.toast.classList.add("show"); toastTimer = setTimeout(() => ui.toast.classList.remove("show"), 1800); }
  function resetAll() {
    ui.search.value = ""; ui.category.value = ""; ui.type.value = ""; ui.abbreviationOnly.checked = false; favoritesOnly = false;
    ui.favoritesFilter.setAttribute("aria-pressed", "false"); activeLetter = "";
    ui.alphabet.querySelectorAll("button").forEach((button) => { const active = button.dataset.letter === ""; button.classList.toggle("active", active); button.setAttribute("aria-pressed", active ? "true" : "false"); });
    applyFilters(); ui.search.focus();
  }

  let inputTimer;
  ui.search.addEventListener("input", () => { clearTimeout(inputTimer); inputTimer = setTimeout(() => applyFilters(), 90); });
  ui.clearSearch.addEventListener("click", () => { ui.search.value = ""; applyFilters(); ui.search.focus(); });
  ui.category.addEventListener("change", () => applyFilters()); ui.type.addEventListener("change", () => applyFilters());
  ui.abbreviationOnly.addEventListener("change", () => applyFilters()); ui.sort.addEventListener("change", () => applyFilters({ preserveSelection: true }));
  ui.favoritesFilter.addEventListener("click", () => { favoritesOnly = !favoritesOnly; ui.favoritesFilter.setAttribute("aria-pressed", String(favoritesOnly)); applyFilters(); });
  ui.resetFilters.addEventListener("click", resetAll); ui.emptyReset.addEventListener("click", resetAll);
  ui.alphabet.addEventListener("click", (event) => { const button = event.target.closest("button[data-letter]"); if (!button) return; activeLetter = button.dataset.letter; ui.alphabet.querySelectorAll("button").forEach((b) => { const active = b === button; b.classList.toggle("active", active); b.setAttribute("aria-pressed", String(active)); }); applyFilters(); });
  ui.results.addEventListener("click", (event) => { const row = event.target.closest(".term-row"); if (row) selectTerm(row.dataset.id); });
  ui.loadMore.addEventListener("click", () => { limit += PAGE_SIZE; renderResults(); });
  ui.recent.addEventListener("click", (event) => { const button = event.target.closest("button[data-id]"); if (button) selectTerm(button.dataset.id); });
  ui.detail.addEventListener("click", (event) => { const action = event.target.closest("button[data-action]")?.dataset.action; const entry = byId.get(selectedId); if (!entry || !action) return; if (action === "favorite") toggleFavorite(entry.id); if (action === "copy") copyEntry(entry); if (action === "share") shareEntry(entry); });
  ui.closeDetails.addEventListener("click", closeMobileDetails); ui.backdrop.addEventListener("click", closeMobileDetails);
  document.addEventListener("keydown", (event) => { if (event.key === "/" && document.activeElement !== ui.search) { event.preventDefault(); ui.search.focus(); } if (event.key === "Escape") closeMobileDetails(); });
  ui.theme.addEventListener("click", () => { const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark"; document.documentElement.dataset.theme = next; writeStorage(STORAGE.theme, next); });

  const savedTheme = readStorage(STORAGE.theme, null);
  if (savedTheme) document.documentElement.dataset.theme = savedTheme;
  ui.total.textContent = entries.length.toLocaleString("ar-SA");
  fillFilters(); renderRecent(); applyFilters();
})();
