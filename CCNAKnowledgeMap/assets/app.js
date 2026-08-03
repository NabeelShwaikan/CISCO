(() => {
  "use strict";

  const PAGE_SIZE = 18;
  const STORAGE = {
    theme: "ccna-explorer-theme",
    favorites: "ccna-explorer-favorites",
    reviewed: "ccna-explorer-reviewed",
  };
  const INDEXED_DB = {
    name: "ccna-teacher-explorer",
    version: 1,
    store: "knowledge",
    key: "active-dataset",
  };

  const TYPE_LABELS = {
    OVERVIEW: "مدخل فصل",
    CONCEPTUAL: "مفهوم نظري",
    PROCEDURAL: "إجراء عملي",
    DIAGNOSTIC: "تشخيص",
    REPRESENTATIONAL: "تمثيل وقراءة",
  };
  const DIFFICULTY_LABELS = {
    FOUNDATIONAL: "تأسيسي",
    INTERMEDIATE: "متوسط",
    ADVANCED: "متقدم",
  };
  const DIFFICULTY_ORDER = {
    FOUNDATIONAL: 1,
    INTERMEDIATE: 2,
    ADVANCED: 3,
  };
  const COVERAGE_LABELS = {
    COVERED: "مغطّى",
    PARTIAL: "تغطية جزئية",
    GAP_REQUIRES_SUPPLEMENT: "يحتاج مصدرًا مكملًا",
  };

  const ids = [
    "databaseButton",
    "dataStatusDot",
    "dataStatusText",
    "themeButton",
    "themeIcon",
    "datasetVersion",
    "datasetReviewState",
    "topicsStat",
    "chaptersStat",
    "relationsStat",
    "labsStat",
    "emptyDatabase",
    "emptyImportButton",
    "showPlacementHelp",
    "workspace",
    "mobileFilterButton",
    "activeFilterCount",
    "filterPanel",
    "resetFiltersButton",
    "searchInput",
    "volumeFilter",
    "domainFilter",
    "chapterFilter",
    "typeFilter",
    "difficultyFilter",
    "examFilter",
    "sortFilter",
    "labOnlyFilter",
    "commandsOnlyFilter",
    "favoritesOnlyFilter",
    "unreviewedOnlyFilter",
    "reviewProgressText",
    "reviewProgressTrack",
    "reviewProgressBar",
    "topicsTab",
    "coverageTab",
    "topicsView",
    "coverageView",
    "resultsCount",
    "resultsSummary",
    "activeFilters",
    "topicGrid",
    "noResults",
    "pagination",
    "previousPageButton",
    "pageNumbers",
    "nextPageButton",
    "coverageVersionSelect",
    "coverageSummary",
    "coverageList",
    "backToTopButton",
    "topicDialog",
    "closeTopicDialog",
    "dialogFavoriteButton",
    "dialogReviewButton",
    "topicDialogContent",
    "databaseDialog",
    "closeDatabaseDialog",
    "databaseDialogDescription",
    "databaseMeta",
    "dialogImportButton",
    "removeDatabaseButton",
    "placementHelp",
    "databaseFileInput",
    "toast",
  ];
  const el = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));

  const state = {
    data: null,
    topicById: new Map(),
    chapterById: new Map(),
    domainById: new Map(),
    prerequisitesByTopic: new Map(),
    unlocksByTopic: new Map(),
    searchIndex: new Map(),
    filteredTopics: [],
    favorites: loadStoredSet(STORAGE.favorites),
    reviewed: loadStoredSet(STORAGE.reviewed),
    page: 1,
    view: "topics",
    objectiveFilter: null,
    currentTopicId: null,
    toastTimer: null,
  };

  function safeStorageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function safeStorageSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Local preferences remain optional in restricted browser contexts.
    }
  }

  function loadStoredSet(key) {
    try {
      const value = JSON.parse(safeStorageGet(key) || "[]");
      return new Set(Array.isArray(value) ? value : []);
    } catch {
      return new Set();
    }
  }

  function persistSets() {
    safeStorageSet(STORAGE.favorites, JSON.stringify([...state.favorites]));
    safeStorageSet(STORAGE.reviewed, JSON.stringify([...state.reviewed]));
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalizeSearch(value) {
    return String(value ?? "")
      .toLocaleLowerCase("ar")
      .normalize("NFKD")
      .replace(/[\u064B-\u065F\u0670]/g, "")
      .replace(/[إأآ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/ؤ/g, "و")
      .replace(/ئ/g, "ي")
      .replace(/ة/g, "ه")
      .replace(/[^\p{L}\p{N}.+/#-]+/gu, " ")
      .trim();
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("ar-SA").format(Number(value) || 0);
  }

  function openIndexedDb() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("IndexedDB unavailable"));
        return;
      }
      const request = indexedDB.open(INDEXED_DB.name, INDEXED_DB.version);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(INDEXED_DB.store)) {
          db.createObjectStore(INDEXED_DB.store);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function readCachedDataset() {
    try {
      const db = await openIndexedDb();
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction(INDEXED_DB.store, "readonly");
        const request = transaction.objectStore(INDEXED_DB.store).get(INDEXED_DB.key);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => db.close();
      });
    } catch {
      return null;
    }
  }

  async function cacheDataset(data) {
    try {
      const db = await openIndexedDb();
      await new Promise((resolve, reject) => {
        const transaction = db.transaction(INDEXED_DB.store, "readwrite");
        transaction.objectStore(INDEXED_DB.store).put(data, INDEXED_DB.key);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
      });
      db.close();
    } catch {
      showToast("تم فتح القاعدة، لكن تعذّر حفظها تلقائيًا في هذا المتصفح.");
    }
  }

  async function deleteCachedDataset() {
    try {
      const db = await openIndexedDb();
      await new Promise((resolve, reject) => {
        const transaction = db.transaction(INDEXED_DB.store, "readwrite");
        transaction.objectStore(INDEXED_DB.store).delete(INDEXED_DB.key);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
      });
      db.close();
    } catch {
      // The visible reset still happens even if the cache is unavailable.
    }
  }

  function validateDataset(data) {
    const valid =
      data &&
      typeof data === "object" &&
      data.metadata &&
      Array.isArray(data.domains) &&
      Array.isArray(data.chapters) &&
      Array.isArray(data.topics) &&
      Array.isArray(data.dependencies) &&
      data.exam_blueprints &&
      data.coverage;
    if (!valid) {
      throw new Error("بنية الملف لا تطابق قاعدة معرفة CCNA المتوقعة.");
    }
    if (!data.topics.length || !data.chapters.length) {
      throw new Error("قاعدة المعرفة لا تحتوي على موضوعات أو فصول.");
    }
    return data;
  }

  async function fetchHostedDataset() {
    try {
      const response = await fetch("./data/ccna_knowledge_map.json", {
        cache: "no-store",
      });
      if (!response.ok) return null;
      return validateDataset(await response.json());
    } catch {
      return null;
    }
  }

  function setTheme(theme) {
    const selected = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = selected;
    el.themeIcon.textContent = selected === "dark" ? "☀" : "☾";
    el.themeButton.setAttribute(
      "aria-label",
      selected === "dark" ? "تفعيل الوضع الفاتح" : "تفعيل الوضع الداكن",
    );
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) {
      themeMeta.setAttribute("content", selected === "dark" ? "#0d1723" : "#075a9c");
    }
    safeStorageSet(STORAGE.theme, selected);
  }

  function initializeTheme() {
    const stored = safeStorageGet(STORAGE.theme);
    const preferredDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    setTheme(stored || (preferredDark ? "dark" : "light"));
  }

  function showToast(message) {
    window.clearTimeout(state.toastTimer);
    el.toast.textContent = message;
    el.toast.classList.add("is-visible");
    state.toastTimer = window.setTimeout(() => {
      el.toast.classList.remove("is-visible");
    }, 2800);
  }

  function setDataReady(ready) {
    el.emptyDatabase.classList.toggle("is-hidden", ready);
    el.workspace.classList.toggle("is-hidden", !ready);
    el.dataStatusDot.classList.toggle("is-ready", ready);
    el.dataStatusText.textContent = ready ? "قاعدة جاهزة" : "لا توجد قاعدة";
    el.removeDatabaseButton.classList.toggle("is-hidden", !ready);
  }

  function resetStats() {
    ["topicsStat", "chaptersStat", "relationsStat", "labsStat"].forEach((id) => {
      el[id].textContent = "—";
    });
    el.datasetVersion.textContent = "—";
    el.datasetReviewState.textContent = "بانتظار الاستيراد";
  }

  function hydrateDataset(data, sourceLabel = "محفوظ محليًا") {
    state.data = validateDataset(data);
    state.topicById = new Map(data.topics.map((topic) => [topic.id, topic]));
    state.chapterById = new Map(data.chapters.map((chapter) => [chapter.id, chapter]));
    state.domainById = new Map(data.domains.map((domain) => [domain.id, domain]));
    state.prerequisitesByTopic = new Map();
    state.unlocksByTopic = new Map();
    state.searchIndex = new Map();
    state.page = 1;
    state.objectiveFilter = null;

    for (const dependency of data.dependencies) {
      const prerequisites = state.prerequisitesByTopic.get(dependency.topic_id) || [];
      prerequisites.push(dependency);
      state.prerequisitesByTopic.set(dependency.topic_id, prerequisites);

      const unlocks = state.unlocksByTopic.get(dependency.prerequisite_id) || [];
      unlocks.push(dependency);
      state.unlocksByTopic.set(dependency.prerequisite_id, unlocks);
    }

    for (const topic of data.topics) {
      const chapter = state.chapterById.get(topic.chapter_id);
      const domain = state.domainById.get(topic.domain_id);
      state.searchIndex.set(
        topic.id,
        normalizeSearch(
          [
            topic.title_ar,
            topic.title_en,
            topic.summary_ar,
            ...(topic.aliases || []),
            chapter?.title_ar,
            chapter?.title_en,
            domain?.title_ar,
            ...(topic.commands || []),
          ].join(" "),
        ),
      );
    }

    state.favorites = new Set(
      [...state.favorites].filter((topicId) => state.topicById.has(topicId)),
    );
    state.reviewed = new Set(
      [...state.reviewed].filter((topicId) => state.topicById.has(topicId)),
    );
    persistSets();

    populateFilterOptions();
    renderStats(sourceLabel);
    setDataReady(true);
    renderTopics();
    renderCoverage();
    renderReviewProgress();
    updateDatabaseDialog();
  }

  function renderStats(sourceLabel) {
    const counts = state.data.validation_summary?.counts || {};
    el.topicsStat.textContent = formatNumber(state.data.topics.length);
    el.chaptersStat.textContent = formatNumber(state.data.chapters.length);
    el.relationsStat.textContent = formatNumber(state.data.dependencies.length);
    el.labsStat.textContent = formatNumber(
      counts.topics_with_labs ??
        state.data.topics.filter((topic) => topic.lab?.suitable).length,
    );
    el.datasetVersion.textContent = state.data.metadata.dataset_version || "—";
    el.datasetReviewState.textContent = sourceLabel;
  }

  function sortedDomains() {
    return [...state.data.domains].sort(
      (a, b) => a.volume - b.volume || a.part - b.part,
    );
  }

  function sortedChapters() {
    return [...state.data.chapters].sort(
      (a, b) => a.global_order - b.global_order,
    );
  }

  function setSelectOptions(select, options, defaultLabel, selectedValue = "") {
    select.innerHTML = [
      `<option value="">${escapeHtml(defaultLabel)}</option>`,
      ...options.map(
        (option) =>
          `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`,
      ),
    ].join("");
    if ([...select.options].some((option) => option.value === selectedValue)) {
      select.value = selectedValue;
    }
  }

  function populateFilterOptions() {
    const selectedDomain = el.domainFilter.value;
    const selectedChapter = el.chapterFilter.value;
    const selectedVolume = el.volumeFilter.value;

    const domains = sortedDomains()
      .filter((domain) => !selectedVolume || String(domain.volume) === selectedVolume)
      .map((domain) => ({
        value: domain.id,
        label: `م${domain.volume} · الجزء ${domain.part} — ${domain.title_ar}`,
      }));
    setSelectOptions(el.domainFilter, domains, "جميع الأجزاء", selectedDomain);

    const activeDomain = el.domainFilter.value;
    const chapters = sortedChapters()
      .filter((chapter) => !selectedVolume || String(chapter.volume) === selectedVolume)
      .filter((chapter) => !activeDomain || chapter.domain_id === activeDomain)
      .map((chapter) => ({
        value: chapter.id,
        label: `م${chapter.volume} · ف${chapter.number} — ${chapter.title_ar}`,
      }));
    setSelectOptions(el.chapterFilter, chapters, "جميع الفصول", selectedChapter);
  }

  function getActiveFilterCount() {
    let count = 0;
    [
      el.searchInput.value,
      el.volumeFilter.value,
      el.domainFilter.value,
      el.chapterFilter.value,
      el.typeFilter.value,
      el.difficultyFilter.value,
      el.examFilter.value,
      state.objectiveFilter,
    ].forEach((value) => {
      if (value) count += 1;
    });
    [
      el.labOnlyFilter,
      el.commandsOnlyFilter,
      el.favoritesOnlyFilter,
      el.unreviewedOnlyFilter,
    ].forEach((checkbox) => {
      if (checkbox.checked) count += 1;
    });
    return count;
  }

  function getFilteredTopics() {
    const query = normalizeSearch(el.searchInput.value);
    const volume = el.volumeFilter.value;
    const domain = el.domainFilter.value;
    const chapter = el.chapterFilter.value;
    const type = el.typeFilter.value;
    const difficulty = el.difficultyFilter.value;
    const exam = el.examFilter.value;

    const filtered = state.data.topics.filter((topic) => {
      if (query && !state.searchIndex.get(topic.id)?.includes(query)) return false;
      if (volume && String(topic.source_ref.volume) !== volume) return false;
      if (domain && topic.domain_id !== domain) return false;
      if (chapter && topic.chapter_id !== chapter) return false;
      if (type && topic.type !== type) return false;
      if (difficulty && topic.difficulty !== difficulty) return false;
      if (exam && !(topic.exam_alignment?.[exam] || []).length) return false;
      if (
        state.objectiveFilter &&
        !(topic.exam_alignment?.[state.objectiveFilter.version] || []).includes(
          state.objectiveFilter.code,
        )
      ) {
        return false;
      }
      if (el.labOnlyFilter.checked && !topic.lab?.suitable) return false;
      if (el.commandsOnlyFilter.checked && !(topic.commands || []).length) return false;
      if (el.favoritesOnlyFilter.checked && !state.favorites.has(topic.id)) return false;
      if (el.unreviewedOnlyFilter.checked && state.reviewed.has(topic.id)) return false;
      return true;
    });

    const sort = el.sortFilter.value;
    filtered.sort((a, b) => {
      if (sort === "title") {
        return a.title_ar.localeCompare(b.title_ar, "ar");
      }
      if (sort === "difficulty") {
        return (
          DIFFICULTY_ORDER[a.difficulty] - DIFFICULTY_ORDER[b.difficulty] ||
          compareStudyOrder(a, b)
        );
      }
      return compareStudyOrder(a, b);
    });
    return filtered;
  }

  function compareStudyOrder(a, b) {
    const chapterA = state.chapterById.get(a.chapter_id);
    const chapterB = state.chapterById.get(b.chapter_id);
    return (
      (chapterA?.global_order || 0) - (chapterB?.global_order || 0) ||
      a.source_order - b.source_order
    );
  }

  function featureBadges(topic) {
    const badges = [];
    if (topic.lab?.suitable) {
      badges.push('<span class="feature-badge feature-badge--lab">⚗ مختبر</span>');
    }
    if ((topic.commands || []).length) {
      badges.push(
        `<span class="feature-badge feature-badge--command">&gt;_ ${formatNumber(
          topic.commands.length,
        )} أوامر</span>`,
      );
    }
    const prerequisiteCount = (state.prerequisitesByTopic.get(topic.id) || []).length;
    if (prerequisiteCount) {
      badges.push(
        `<span class="feature-badge">↳ ${formatNumber(prerequisiteCount)} متطلبات</span>`,
      );
    }
    return badges.join("");
  }

  function topicCardHtml(topic) {
    const chapter = state.chapterById.get(topic.chapter_id);
    const favorite = state.favorites.has(topic.id);
    const reviewed = state.reviewed.has(topic.id);
    return `
      <article
        class="topic-card${reviewed ? " is-reviewed" : ""}"
        data-topic-id="${escapeHtml(topic.id)}"
      >
        <button
          class="topic-card__open"
          type="button"
          data-action="open"
          data-topic-id="${escapeHtml(topic.id)}"
          aria-label="فتح تفاصيل ${escapeHtml(topic.title_ar)}"
        ><span class="visually-hidden">فتح التفاصيل</span></button>
        <div class="topic-card__top">
          <div class="topic-card__meta">
            <span class="topic-type">${escapeHtml(TYPE_LABELS[topic.type] || topic.type)}</span>
            <span class="difficulty-badge">${escapeHtml(
              DIFFICULTY_LABELS[topic.difficulty] || topic.difficulty,
            )}</span>
          </div>
          <button
            class="favorite-button${favorite ? " is-active" : ""}"
            type="button"
            data-action="favorite"
            data-topic-id="${escapeHtml(topic.id)}"
            aria-label="${favorite ? "إزالة من المفضلة" : "إضافة إلى المفضلة"}"
            title="${favorite ? "إزالة من المفضلة" : "إضافة إلى المفضلة"}"
          >${favorite ? "★" : "☆"}</button>
        </div>
        <h3>${escapeHtml(topic.title_ar)}</h3>
        <p class="topic-card__english" lang="en">${escapeHtml(topic.title_en)}</p>
        <p class="topic-card__summary">${escapeHtml(topic.summary_ar)}</p>
        <div class="topic-card__features">${featureBadges(topic)}</div>
        <footer class="topic-card__footer">
          <strong>م${topic.source_ref.volume} · ف${topic.source_ref.chapter} · ص${formatNumber(
            topic.source_ref.printed_page,
          )}</strong>
          <span>${reviewed ? '<span class="reviewed-mark">✓ تمت المراجعة</span>' : escapeHtml(chapter?.title_ar || "")}</span>
        </footer>
      </article>
    `;
  }

  function renderTopics() {
    if (!state.data) return;
    state.filteredTopics = getFilteredTopics();
    const total = state.filteredTopics.length;
    const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
    state.page = Math.min(Math.max(1, state.page), pageCount);
    const start = (state.page - 1) * PAGE_SIZE;
    const visibleTopics = state.filteredTopics.slice(start, start + PAGE_SIZE);

    el.resultsCount.textContent = formatNumber(total);
    el.resultsSummary.textContent = total
      ? `الصفحة ${formatNumber(state.page)} من ${formatNumber(pageCount)}`
      : "عدّل الفلاتر لإظهار موضوعات أخرى";
    el.topicGrid.innerHTML = visibleTopics.map(topicCardHtml).join("");
    el.topicGrid.classList.toggle("is-hidden", total === 0);
    el.noResults.classList.toggle("is-hidden", total !== 0);
    el.pagination.classList.toggle("is-hidden", total <= PAGE_SIZE);
    renderPagination(pageCount);
    renderActiveFilters();
    el.activeFilterCount.textContent = formatNumber(getActiveFilterCount());
  }

  function paginationWindow(pageCount) {
    if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);
    const pages = new Set([1, pageCount, state.page - 1, state.page, state.page + 1]);
    return [...pages].filter((page) => page >= 1 && page <= pageCount).sort((a, b) => a - b);
  }

  function renderPagination(pageCount) {
    el.previousPageButton.disabled = state.page <= 1;
    el.nextPageButton.disabled = state.page >= pageCount;
    const pages = paginationWindow(pageCount);
    let previous = 0;
    const html = [];
    for (const page of pages) {
      if (previous && page - previous > 1) {
        html.push('<span aria-hidden="true">…</span>');
      }
      html.push(
        `<button type="button" data-page="${page}" class="${
          page === state.page ? "is-active" : ""
        }" aria-label="الصفحة ${page}" ${
          page === state.page ? 'aria-current="page"' : ""
        }>${formatNumber(page)}</button>`,
      );
      previous = page;
    }
    el.pageNumbers.innerHTML = html.join("");
  }

  function currentFilterTokens() {
    const tokens = [];
    const add = (key, label) => tokens.push({ key, label });
    if (el.searchInput.value.trim()) add("search", `بحث: ${el.searchInput.value.trim()}`);
    if (el.volumeFilter.value) {
      add("volume", el.volumeFilter.selectedOptions[0]?.textContent || "المجلد");
    }
    if (el.domainFilter.value) {
      add("domain", el.domainFilter.selectedOptions[0]?.textContent || "الجزء");
    }
    if (el.chapterFilter.value) {
      add("chapter", el.chapterFilter.selectedOptions[0]?.textContent || "الفصل");
    }
    if (el.typeFilter.value) add("type", TYPE_LABELS[el.typeFilter.value]);
    if (el.difficultyFilter.value) {
      add("difficulty", DIFFICULTY_LABELS[el.difficultyFilter.value]);
    }
    if (el.examFilter.value) add("exam", `اختبار ${el.examFilter.value}`);
    if (state.objectiveFilter) {
      add(
        "objective",
        `الهدف ${state.objectiveFilter.version} · ${state.objectiveFilter.code}`,
      );
    }
    if (el.labOnlyFilter.checked) add("labs", "مختبرات فقط");
    if (el.commandsOnlyFilter.checked) add("commands", "بها أوامر");
    if (el.favoritesOnlyFilter.checked) add("favorites", "المفضلة");
    if (el.unreviewedOnlyFilter.checked) add("unreviewed", "غير المراجعة");
    return tokens;
  }

  function renderActiveFilters() {
    const tokens = currentFilterTokens();
    el.activeFilters.classList.toggle("is-hidden", tokens.length === 0);
    el.activeFilters.innerHTML = tokens
      .map(
        (token) => `
          <span class="filter-token">
            ${escapeHtml(token.label)}
            <button type="button" data-clear-filter="${escapeHtml(
              token.key,
            )}" aria-label="إزالة فلتر ${escapeHtml(token.label)}">×</button>
          </span>
        `,
      )
      .join("");
  }

  function clearFilter(key) {
    const controls = {
      search: el.searchInput,
      volume: el.volumeFilter,
      domain: el.domainFilter,
      chapter: el.chapterFilter,
      type: el.typeFilter,
      difficulty: el.difficultyFilter,
      exam: el.examFilter,
    };
    if (controls[key]) controls[key].value = "";
    if (key === "objective") state.objectiveFilter = null;
    if (key === "labs") el.labOnlyFilter.checked = false;
    if (key === "commands") el.commandsOnlyFilter.checked = false;
    if (key === "favorites") el.favoritesOnlyFilter.checked = false;
    if (key === "unreviewed") el.unreviewedOnlyFilter.checked = false;
    if (["volume", "domain"].includes(key)) populateFilterOptions();
    state.page = 1;
    renderTopics();
  }

  function resetFilters() {
    el.searchInput.value = "";
    el.volumeFilter.value = "";
    el.domainFilter.value = "";
    el.chapterFilter.value = "";
    el.typeFilter.value = "";
    el.difficultyFilter.value = "";
    el.examFilter.value = "";
    el.sortFilter.value = "study";
    el.labOnlyFilter.checked = false;
    el.commandsOnlyFilter.checked = false;
    el.favoritesOnlyFilter.checked = false;
    el.unreviewedOnlyFilter.checked = false;
    state.objectiveFilter = null;
    state.page = 1;
    populateFilterOptions();
    renderTopics();
  }

  function renderReviewProgress() {
    if (!state.data) return;
    const total = state.data.topics.length;
    const reviewed = state.reviewed.size;
    const percent = total ? Math.round((reviewed / total) * 100) : 0;
    el.reviewProgressText.textContent = `${formatNumber(reviewed)} من ${formatNumber(total)}`;
    el.reviewProgressBar.style.width = `${percent}%`;
    el.reviewProgressTrack.setAttribute("aria-valuenow", String(percent));
  }

  function toggleFavorite(topicId) {
    if (state.favorites.has(topicId)) {
      state.favorites.delete(topicId);
      showToast("أزيل الموضوع من المفضلة.");
    } else {
      state.favorites.add(topicId);
      showToast("أضيف الموضوع إلى المفضلة.");
    }
    persistSets();
    renderTopics();
    if (state.currentTopicId === topicId) updateDialogActionButtons(topicId);
  }

  function toggleReviewed(topicId) {
    if (state.reviewed.has(topicId)) {
      state.reviewed.delete(topicId);
      showToast("أعيد الموضوع إلى قائمة غير المراجعة.");
    } else {
      state.reviewed.add(topicId);
      showToast("تم تسجيل مراجعة الموضوع.");
    }
    persistSets();
    renderReviewProgress();
    renderTopics();
    if (state.currentTopicId === topicId) updateDialogActionButtons(topicId);
  }

  function relationHtml(dependency, direction) {
    const relatedId =
      direction === "prerequisite"
        ? dependency.prerequisite_id
        : dependency.topic_id;
    const topic = state.topicById.get(relatedId);
    if (!topic) return "";
    return `
      <button class="relation-item" type="button" data-open-topic="${escapeHtml(
        topic.id,
      )}">
        <span>
          <strong>${escapeHtml(topic.title_ar)}</strong>
          <small>${escapeHtml(dependency.reason_ar || topic.title_en)}</small>
        </span>
        <span class="relation-strength${
          dependency.strength === "SOFT" ? " relation-strength--soft" : ""
        }">${dependency.strength === "HARD" ? "أساسي" : "تسلسلي"}</span>
      </button>
    `;
  }

  function commandHtml(command) {
    return `
      <div class="command-item">
        <code>${escapeHtml(command)}</code>
        <button
          class="copy-command"
          type="button"
          data-copy-command="${escapeHtml(command)}"
          aria-label="نسخ الأمر ${escapeHtml(command)}"
        >نسخ</button>
      </div>
    `;
  }

  function detailSection(title, icon, content, wide = false) {
    return `
      <section class="detail-section${wide ? " detail-section--wide" : ""}">
        <h3><span aria-hidden="true">${icon}</span>${escapeHtml(title)}</h3>
        ${content}
      </section>
    `;
  }

  function openTopic(topicId) {
    const topic = state.topicById.get(topicId);
    if (!topic) return;
    const chapter = state.chapterById.get(topic.chapter_id);
    const prerequisites = [...(state.prerequisitesByTopic.get(topic.id) || [])].sort(
      (a, b) => (a.strength === "HARD" ? -1 : 1) - (b.strength === "HARD" ? -1 : 1),
    );
    const unlocks = [...(state.unlocksByTopic.get(topic.id) || [])].sort(
      (a, b) => (a.strength === "HARD" ? -1 : 1) - (b.strength === "HARD" ? -1 : 1),
    );
    const evidence = (topic.mastery_evidence_ar || [])
      .map((item) => `<li>${escapeHtml(item)}</li>`)
      .join("");
    const commands = (topic.commands || []).map(commandHtml).join("");
    const examChips = Object.entries(topic.exam_alignment || {})
      .flatMap(([version, codes]) =>
        (codes || []).map(
          (code) =>
            `<span class="exam-chip">${escapeHtml(version)} · ${escapeHtml(code)}</span>`,
        ),
      )
      .join("");

    const details = [
      detailSection(
        "دليل الإتقان",
        "✓",
        evidence
          ? `<ul class="evidence-list">${evidence}</ul>`
          : '<p class="empty-detail">لا توجد معايير إتقان مسجلة.</p>',
      ),
      detailSection(
        "سؤال تقويمي",
        "؟",
        `<p class="assessment-box">${escapeHtml(topic.assessment_prompt_ar)}</p>`,
      ),
      detailSection(
        "أوامر التحقق",
        "&gt;_",
        commands
          ? `<div class="command-list">${commands}</div>`
          : '<p class="empty-detail">لا يحتاج هذا المفهوم إلى أوامر مباشرة.</p>',
      ),
      detailSection(
        "المختبر المقترح",
        "⚗",
        topic.lab?.suitable
          ? `<p class="lab-box">${escapeHtml(topic.lab.prompt_ar)}</p>`
          : '<p class="empty-detail">لا يوجد مختبر مستقل لهذا المفهوم.</p>',
      ),
      detailSection(
        "المتطلبات السابقة",
        "↳",
        prerequisites.length
          ? `<div class="relation-list">${prerequisites
              .map((dependency) => relationHtml(dependency, "prerequisite"))
              .join("")}</div>`
          : '<p class="empty-detail">هذا مفهوم تأسيسي ولا توجد له متطلبات مسجلة.</p>',
      ),
      detailSection(
        "ما الذي يفتحه هذا المفهوم؟",
        "⇢",
        unlocks.length
          ? `<div class="relation-list">${unlocks
              .map((dependency) => relationHtml(dependency, "unlock"))
              .join("")}</div>`
          : '<p class="empty-detail">لا توجد علاقات لاحقة مسجلة.</p>',
      ),
      detailSection(
        "الارتباط بالاختبار",
        "◎",
        examChips
          ? `<div class="exam-alignment">${examChips}</div>`
          : '<p class="empty-detail">لم يُربط هذا العنوان مباشرة بهدف اختبار.</p>',
        true,
      ),
    ].join("");

    el.topicDialogContent.innerHTML = `
      <header class="topic-detail__header">
        <div>
          <div class="topic-card__meta">
            <span class="topic-type">${escapeHtml(TYPE_LABELS[topic.type] || topic.type)}</span>
            <span class="difficulty-badge">${escapeHtml(
              DIFFICULTY_LABELS[topic.difficulty] || topic.difficulty,
            )}</span>
          </div>
          <h2>${escapeHtml(topic.title_ar)}</h2>
          <p class="topic-detail__english" lang="en">${escapeHtml(topic.title_en)}</p>
        </div>
        <div class="source-badge">
          <span>المجلد ${formatNumber(topic.source_ref.volume)}</span>
          <strong>ف${formatNumber(topic.source_ref.chapter)} · ص${formatNumber(
            topic.source_ref.printed_page,
          )}</strong>
        </div>
      </header>
      <p class="topic-detail__summary">${escapeHtml(topic.summary_ar)}</p>
      <div class="detail-grid">${details}</div>
      ${
        topic.review?.expert_review_required
          ? '<p class="review-notice">ملاحظة: الصياغة العربية والعلاقات المستنتجة لهذا العنوان موسومة للمراجعة العلمية النهائية.</p>'
          : ""
      }
      <p class="empty-detail" style="margin-top:.75rem">${escapeHtml(
        chapter?.title_ar || "",
      )}</p>
    `;
    state.currentTopicId = topic.id;
    updateDialogActionButtons(topic.id);
    if (!el.topicDialog.open) el.topicDialog.showModal();
    el.topicDialogContent.scrollTop = 0;
  }

  function updateDialogActionButtons(topicId) {
    const favorite = state.favorites.has(topicId);
    const reviewed = state.reviewed.has(topicId);
    el.dialogFavoriteButton.classList.toggle("is-active", favorite);
    el.dialogFavoriteButton.textContent = favorite ? "★ في المفضلة" : "☆ إضافة للمفضلة";
    el.dialogReviewButton.classList.toggle("is-active", reviewed);
    el.dialogReviewButton.textContent = reviewed ? "✓ تمت المراجعة" : "✓ تعليم كمراجع";
  }

  async function copyText(value) {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    showToast("نُسخ الأمر.");
  }

  function coverageStatusClass(status) {
    if (status === "COVERED") return "coverage-status--covered";
    if (status === "PARTIAL") return "coverage-status--partial";
    return "coverage-status--gap";
  }

  function renderCoverage() {
    if (!state.data) return;
    const version = el.coverageVersionSelect.value;
    const records = state.data.coverage?.[version] || [];
    const objectives = state.data.exam_blueprints?.[version]?.objectives || [];
    const objectiveByCode = new Map(
      objectives.map((objective) => [objective.code, objective]),
    );
    const counts = records.reduce(
      (summary, record) => {
        summary[record.status] = (summary[record.status] || 0) + 1;
        return summary;
      },
      {},
    );
    const summaryItems = [
      ["COVERED", "أهداف مغطّاة"],
      ["PARTIAL", "تغطية جزئية"],
      ["GAP_REQUIRES_SUPPLEMENT", "تحتاج مصادر مكملة"],
    ];
    el.coverageSummary.innerHTML = summaryItems
      .map(
        ([status, label]) => `
          <article class="coverage-summary-card">
            <strong>${formatNumber(counts[status] || 0)}</strong>
            <span>${escapeHtml(label)}</span>
          </article>
        `,
      )
      .join("");

    el.coverageList.innerHTML = records
      .map((record) => {
        const objective = objectiveByCode.get(record.code);
        return `
          <button
            class="coverage-item"
            type="button"
            data-objective-version="${escapeHtml(version)}"
            data-objective-code="${escapeHtml(record.code)}"
            title="عرض الموضوعات المرتبطة"
          >
            <span class="coverage-item__code">${escapeHtml(record.code)}</span>
            <div>
              <h3>${escapeHtml(objective?.title_ar || objective?.title_en || record.code)}</h3>
              <p>${escapeHtml(record.note_ar)} · ${formatNumber(
                record.matched_topic_count,
              )} موضوعًا مرتبطًا</p>
            </div>
            <span class="coverage-status ${coverageStatusClass(record.status)}">${escapeHtml(
              COVERAGE_LABELS[record.status] || record.status,
            )}</span>
          </button>
        `;
      })
      .join("");
  }

  function switchView(view) {
    state.view = view === "coverage" ? "coverage" : "topics";
    const topicsActive = state.view === "topics";
    el.topicsTab.classList.toggle("is-active", topicsActive);
    el.coverageTab.classList.toggle("is-active", !topicsActive);
    el.topicsTab.setAttribute("aria-selected", String(topicsActive));
    el.coverageTab.setAttribute("aria-selected", String(!topicsActive));
    el.topicsView.classList.toggle("is-hidden", !topicsActive);
    el.coverageView.classList.toggle("is-hidden", topicsActive);
    if (!topicsActive) renderCoverage();
  }

  function updateDatabaseDialog() {
    const ready = Boolean(state.data);
    el.databaseMeta.classList.toggle("is-hidden", !ready);
    if (ready) {
      el.databaseDialogDescription.textContent =
        "القاعدة جاهزة ويمكنك استبدالها بإصدار أحدث في أي وقت.";
      el.databaseMeta.innerHTML = `
        <div><strong>${escapeHtml(state.data.metadata.dataset_version)}</strong><span>الإصدار</span></div>
        <div><strong>${formatNumber(state.data.topics.length)}</strong><span>الموضوعات</span></div>
        <div><strong>${formatNumber(state.data.chapters.length)}</strong><span>الفصول</span></div>
      `;
      el.dialogImportButton.textContent = "استبدال قاعدة البيانات";
    } else {
      el.databaseDialogDescription.textContent =
        "اختر ملف JSON المحفوظ لديك. ستبقى البيانات داخل هذا المتصفح.";
      el.databaseMeta.innerHTML = "";
      el.dialogImportButton.textContent = "اختيار قاعدة البيانات";
    }
  }

  function showDatabaseDialog(showHelp = false) {
    updateDatabaseDialog();
    el.placementHelp.classList.toggle("is-hidden", !showHelp);
    if (!el.databaseDialog.open) el.databaseDialog.showModal();
  }

  async function importFile(file) {
    if (!file) return;
    try {
      if (file.size > 40 * 1024 * 1024) {
        throw new Error("حجم الملف أكبر من الحد المتوقع.");
      }
      const data = validateDataset(JSON.parse(await file.text()));
      await cacheDataset(data);
      hydrateDataset(data, "محفوظ محليًا");
      if (el.databaseDialog.open) el.databaseDialog.close();
      showToast("تم استيراد قاعدة المعرفة بنجاح.");
    } catch (error) {
      showToast(error?.message || "تعذّر قراءة ملف JSON.");
    } finally {
      el.databaseFileInput.value = "";
    }
  }

  async function removeDataset() {
    if (!window.confirm("إزالة النسخة المحفوظة من هذا المتصفح؟ لن يُحذف ملفك الأصلي.")) {
      return;
    }
    await deleteCachedDataset();
    state.data = null;
    state.topicById.clear();
    state.chapterById.clear();
    state.domainById.clear();
    state.currentTopicId = null;
    setDataReady(false);
    resetStats();
    if (el.databaseDialog.open) el.databaseDialog.close();
    showToast("أزيلت النسخة المحلية. ملفك الأصلي لم يتغير.");
  }

  function handleTopicGridClick(event) {
    const favoriteButton = event.target.closest('[data-action="favorite"]');
    if (favoriteButton) {
      event.stopPropagation();
      toggleFavorite(favoriteButton.dataset.topicId);
      return;
    }
    const card = event.target.closest("[data-topic-id]");
    if (card) openTopic(card.dataset.topicId);
  }

  function filterChanged(event) {
    if (event.target === el.volumeFilter || event.target === el.domainFilter) {
      populateFilterOptions();
    }
    if (event.target === el.examFilter) {
      state.objectiveFilter = null;
    }
    state.page = 1;
    renderTopics();
  }

  function bindEvents() {
    el.themeButton.addEventListener("click", () => {
      setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
    });
    el.databaseButton.addEventListener("click", () => showDatabaseDialog(false));
    el.emptyImportButton.addEventListener("click", () => el.databaseFileInput.click());
    el.dialogImportButton.addEventListener("click", () => el.databaseFileInput.click());
    el.showPlacementHelp.addEventListener("click", () => showDatabaseDialog(true));
    el.closeDatabaseDialog.addEventListener("click", () => el.databaseDialog.close());
    el.removeDatabaseButton.addEventListener("click", removeDataset);
    el.databaseFileInput.addEventListener("change", (event) =>
      importFile(event.target.files?.[0]),
    );

    const filterControls = [
      el.volumeFilter,
      el.domainFilter,
      el.chapterFilter,
      el.typeFilter,
      el.difficultyFilter,
      el.examFilter,
      el.sortFilter,
      el.labOnlyFilter,
      el.commandsOnlyFilter,
      el.favoritesOnlyFilter,
      el.unreviewedOnlyFilter,
    ];
    filterControls.forEach((control) => control.addEventListener("change", filterChanged));
    let searchTimer;
    el.searchInput.addEventListener("input", () => {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(() => {
        state.page = 1;
        renderTopics();
      }, 120);
    });
    el.resetFiltersButton.addEventListener("click", resetFilters);

    el.mobileFilterButton.addEventListener("click", () => {
      const open = el.filterPanel.classList.toggle("is-mobile-open");
      el.mobileFilterButton.setAttribute("aria-expanded", String(open));
    });

    [el.topicsTab, el.coverageTab].forEach((tab) => {
      tab.addEventListener("click", () => switchView(tab.dataset.view));
    });
    el.coverageVersionSelect.addEventListener("change", renderCoverage);
    el.coverageList.addEventListener("click", (event) => {
      const item = event.target.closest("[data-objective-code]");
      if (!item) return;
      state.objectiveFilter = {
        version: item.dataset.objectiveVersion,
        code: item.dataset.objectiveCode,
      };
      el.examFilter.value = item.dataset.objectiveVersion;
      state.page = 1;
      switchView("topics");
      renderTopics();
      el.resultsCount.scrollIntoView({ behavior: "smooth", block: "center" });
    });

    el.topicGrid.addEventListener("click", handleTopicGridClick);
    el.activeFilters.addEventListener("click", (event) => {
      const button = event.target.closest("[data-clear-filter]");
      if (button) clearFilter(button.dataset.clearFilter);
    });

    el.previousPageButton.addEventListener("click", () => {
      if (state.page > 1) {
        state.page -= 1;
        renderTopics();
        el.resultsCount.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
    el.nextPageButton.addEventListener("click", () => {
      const pageCount = Math.ceil(state.filteredTopics.length / PAGE_SIZE);
      if (state.page < pageCount) {
        state.page += 1;
        renderTopics();
        el.resultsCount.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
    el.pageNumbers.addEventListener("click", (event) => {
      const button = event.target.closest("[data-page]");
      if (!button) return;
      state.page = Number(button.dataset.page);
      renderTopics();
      el.resultsCount.scrollIntoView({ behavior: "smooth", block: "center" });
    });

    el.closeTopicDialog.addEventListener("click", () => el.topicDialog.close());
    el.dialogFavoriteButton.addEventListener("click", () => {
      if (state.currentTopicId) toggleFavorite(state.currentTopicId);
    });
    el.dialogReviewButton.addEventListener("click", () => {
      if (state.currentTopicId) toggleReviewed(state.currentTopicId);
    });
    el.topicDialogContent.addEventListener("click", (event) => {
      const related = event.target.closest("[data-open-topic]");
      if (related) {
        openTopic(related.dataset.openTopic);
        return;
      }
      const copyButton = event.target.closest("[data-copy-command]");
      if (copyButton) copyText(copyButton.dataset.copyCommand);
    });

    [el.topicDialog, el.databaseDialog].forEach((dialog) => {
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) dialog.close();
      });
    });

    window.addEventListener(
      "scroll",
      () => {
        el.backToTopButton.classList.toggle("is-visible", window.scrollY > 500);
      },
      { passive: true },
    );
    el.backToTopButton.addEventListener("click", () =>
      window.scrollTo({ top: 0, behavior: "smooth" }),
    );
    document.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        el.searchInput.focus();
        el.searchInput.select();
      }
    });

    ["dragenter", "dragover"].forEach((type) => {
      el.emptyDatabase.addEventListener(type, (event) => {
        event.preventDefault();
        el.emptyDatabase.classList.add("is-dragging");
      });
    });
    ["dragleave", "drop"].forEach((type) => {
      el.emptyDatabase.addEventListener(type, (event) => {
        event.preventDefault();
        el.emptyDatabase.classList.remove("is-dragging");
      });
    });
    el.emptyDatabase.addEventListener("drop", (event) => {
      importFile(event.dataTransfer?.files?.[0]);
    });
  }

  async function boot() {
    initializeTheme();
    bindEvents();
    resetStats();
    setDataReady(false);

    let data = null;
    let sourceLabel = "محفوظ محليًا";
    if (location.protocol !== "file:") {
      data = await fetchHostedDataset();
      if (data) {
        sourceLabel = "محمّلة تلقائيًا";
        await cacheDataset(data);
      }
    }
    if (!data) data = await readCachedDataset();

    if (data) {
      try {
        hydrateDataset(data, sourceLabel);
      } catch {
        await deleteCachedDataset();
        setDataReady(false);
        showToast("النسخة المحفوظة غير صالحة؛ اختر ملف القاعدة من جديد.");
      }
    }
  }

  boot();
})();
