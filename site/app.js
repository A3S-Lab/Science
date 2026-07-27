(() => {
  "use strict";

  const KIND_ORDER = ["All", "Skill", "MCP", "Software", "Agent", "Workbench"];
  const KIND_COLORS = {
    Skill: "#93f6c1",
    MCP: "#67e0c0",
    Software: "#7ba7ff",
    Agent: "#ffb067",
    Workbench: "#f28bd6"
  };
  const GROUP_COLORS = {
    "Cross-disciplinary": "#c8a7ff",
    "Natural Sciences": "#75e7ff",
    "Engineering and Technology": "#ffb067",
    "Medical and Health Sciences": "#ff8069",
    "Agricultural and Veterinary Sciences": "#93f6c1",
    "Social Sciences": "#7ba7ff",
    "Humanities and the Arts": "#f28bd6"
  };
  const PAGE_SIZE = 18;
  const state = {
    taxonomy: null,
    resources: [],
    roadmapMap: new Map(),
    kind: "All",
    query: "",
    discipline: "",
    capability: "",
    origin: "",
    visible: PAGE_SIZE
  };

  const elements = {};

  function normalizeArray(value) {
    if (Array.isArray(value)) return value;
    return value ? [value] : [];
  }

  async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not load ${url}: ${response.status}`);
    return response.json();
  }

  async function fetchJsonLines(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not load ${url}: ${response.status}`);
    const text = await response.text();
    return text
      .split(/\r?\n/)
      .filter(line => line.trim())
      .map((line, index) => {
        try {
          return JSON.parse(line);
        } catch (error) {
          throw new Error(`Invalid JSONL in ${url} at line ${index + 1}: ${error.message}`);
        }
      });
  }

  function create(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function taxonomyLookup(entries) {
    return new Map(entries.map(entry => [entry.id, entry]));
  }

  function bilingualLabel(entry) {
    return `${entry.name} / ${entry.nameZh}`;
  }

  function loadUrlState() {
    const params = new URLSearchParams(window.location.search);
    state.query = params.get("q") || "";
    state.kind = KIND_ORDER.includes(params.get("kind")) ? params.get("kind") : "All";
    state.discipline = params.get("discipline") || "";
    state.capability = params.get("capability") || "";
    state.origin = params.get("origin") || "";
  }

  function syncUrlState() {
    const params = new URLSearchParams();
    if (state.query) params.set("q", state.query);
    if (state.kind !== "All") params.set("kind", state.kind);
    if (state.discipline) params.set("discipline", state.discipline);
    if (state.capability) params.set("capability", state.capability);
    if (state.origin) params.set("origin", state.origin);
    const query = params.toString();
    history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
  }

  function setMetrics() {
    const metrics = {
      resources: state.resources.length,
      disciplines: state.taxonomy.disciplines.length,
      skills: state.resources.filter(resource => resource.kind === "Skill").length,
      mcp: state.resources.filter(resource => resource.kind === "MCP").length,
      roadmaps: state.roadmapMap.size
    };
    for (const [name, value] of Object.entries(metrics)) {
      document.querySelectorAll(`[data-metric="${name}"]`).forEach(node => {
        node.textContent = value.toLocaleString();
      });
    }
    for (const origin of ["native", "ecosystem", "sciencesoftware"]) {
      const count = state.resources.filter(resource => resource.origin === origin).length;
      document.querySelectorAll(`[data-origin-count="${origin}"]`).forEach(node => {
        node.textContent = count.toLocaleString();
      });
    }
  }

  function populateSelects() {
    const disciplineFragment = document.createDocumentFragment();
    for (const discipline of state.taxonomy.disciplines) {
      const option = document.createElement("option");
      option.value = discipline.id;
      option.textContent = `${discipline.code} · ${bilingualLabel(discipline)}`;
      disciplineFragment.append(option);
    }
    elements.discipline.append(disciplineFragment);

    const capabilityFragment = document.createDocumentFragment();
    for (const capability of state.taxonomy.capabilities) {
      const option = document.createElement("option");
      option.value = capability.id;
      option.textContent = bilingualLabel(capability);
      capabilityFragment.append(option);
    }
    elements.capability.append(capabilityFragment);

    elements.search.value = state.query;
    elements.discipline.value = state.discipline;
    elements.capability.value = state.capability;
    elements.origin.value = state.origin;
  }

  function renderKindTabs() {
    elements.kindTabs.replaceChildren();
    for (const kind of KIND_ORDER) {
      const count = kind === "All"
        ? state.resources.length
        : state.resources.filter(resource => resource.kind === kind).length;
      const button = create("button", `kind-tab${state.kind === kind ? " is-active" : ""}`);
      button.type = "button";
      button.setAttribute("aria-pressed", String(state.kind === kind));
      button.append(document.createTextNode(kind));
      const countNode = create("span", "", count.toLocaleString());
      button.append(countNode);
      button.addEventListener("click", () => {
        state.kind = kind;
        state.visible = PAGE_SIZE;
        renderKindTabs();
        renderCatalog();
        syncUrlState();
      });
      elements.kindTabs.append(button);
    }
  }

  function resourceCountsByDiscipline() {
    const counts = new Map(state.taxonomy.disciplines.map(item => [item.id, 0]));
    for (const resource of state.resources) {
      for (const discipline of normalizeArray(resource.disciplines)) {
        counts.set(discipline, (counts.get(discipline) || 0) + 1);
      }
    }
    return counts;
  }

  function renderDisciplines() {
    const counts = resourceCountsByDiscipline();
    elements.disciplineGroups.replaceChildren();
    for (const discipline of state.taxonomy.disciplines) {
      const card = create("button", "discipline-card");
      card.type = "button";
      card.style.setProperty("--card-accent", GROUP_COLORS[discipline.group] || "#75e7ff");
      card.setAttribute("aria-label", `Filter catalog by ${bilingualLabel(discipline)}`);

      const code = create("div", "discipline-code");
      code.append(
        document.createTextNode(`${discipline.code} / ${discipline.group}`),
        create("i")
      );
      const title = create("h3", "", discipline.name);
      title.append(create("span", "", discipline.nameZh));
      const footer = document.createElement("footer");
      footer.append(
        create("span", "", `${(counts.get(discipline.id) || 0).toLocaleString()} resources`),
        create("span", "", "Explore →")
      );
      card.append(code, title, footer);
      card.addEventListener("click", () => {
        state.discipline = discipline.id;
        state.visible = PAGE_SIZE;
        elements.discipline.value = discipline.id;
        openFilters();
        renderCatalog();
        syncUrlState();
        document.getElementById("catalog").scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth" });
      });
      elements.disciplineGroups.append(card);
    }
  }

  function filteredResources() {
    const query = state.query.trim().toLocaleLowerCase();
    return state.resources
      .filter(resource => state.kind === "All" || resource.kind === state.kind)
      .filter(resource => !state.discipline || normalizeArray(resource.disciplines).includes(state.discipline))
      .filter(resource => !state.capability || normalizeArray(resource.capabilities).includes(state.capability))
      .filter(resource => !state.origin || resource.origin === state.origin)
      .filter(resource => {
        if (!query) return true;
        const searchable = [
          resource.name,
          resource.description,
          resource.source,
          ...normalizeArray(resource.tags)
        ].join(" ").toLocaleLowerCase();
        return searchable.includes(query);
      })
      .sort((left, right) =>
        Number(right.featured) - Number(left.featured) ||
        originRank(left.origin) - originRank(right.origin) ||
        left.name.localeCompare(right.name)
      );
  }

  function originRank(origin) {
    return { native: 0, ecosystem: 1, sciencesoftware: 2 }[origin] ?? 3;
  }

  function originLabel(origin) {
    return {
      native: "A3S native",
      ecosystem: "Ecosystem",
      sciencesoftware: "ScienceSoftware"
    }[origin] || origin;
  }

  function makeTaxonomyTags(resource) {
    const disciplineMap = taxonomyLookup(state.taxonomy.disciplines);
    const capabilityMap = taxonomyLookup(state.taxonomy.capabilities);
    return [
      ...normalizeArray(resource.disciplines).map(id => disciplineMap.get(id)?.nameZh || disciplineMap.get(id)?.name),
      ...normalizeArray(resource.capabilities).map(id => capabilityMap.get(id)?.nameZh || capabilityMap.get(id)?.name)
    ].filter(Boolean);
  }

  function renderCard(resource) {
    const card = create("article", "resource-card");
    card.style.setProperty("--card-color", KIND_COLORS[resource.kind] || "#7ba7ff");

    const topline = create("div", "card-topline");
    const kind = create("span", "kind-badge");
    kind.append(create("i"), document.createTextNode(resource.kind));
    topline.append(kind, create("span", "origin-badge", originLabel(resource.origin)));

    const title = create("h3", "", resource.name);
    const description = create("p", "", resource.description);
    const taxonomy = create("div", "card-taxonomy");
    for (const label of makeTaxonomyTags(resource).slice(0, 3)) {
      taxonomy.append(create("span", "", label));
    }

    const actions = create("div", "card-actions");
    const details = create("button", "", "Inspect");
    details.type = "button";
    details.addEventListener("click", () => openResourceDialog(resource));
    actions.append(details);
    if (resource.roadmap) {
      const roadmap = create("a", "roadmap-link", "Roadmap ↗");
      roadmap.href = resource.roadmap.url;
      roadmap.target = "_blank";
      roadmap.rel = "noreferrer";
      roadmap.setAttribute("aria-label", `Open the modernization roadmap for ${resource.name}`);
      actions.append(roadmap);
    } else {
      const source = create("a", "", "Source ↗");
      source.href = resource.url;
      source.target = "_blank";
      source.rel = "noreferrer";
      source.setAttribute("aria-label", `Open the source for ${resource.name}`);
      actions.append(source);
    }
    card.append(topline, title, description, taxonomy, actions);
    return card;
  }

  function renderCatalog() {
    const resources = filteredResources();
    elements.catalogCount.textContent = resources.length.toLocaleString();
    const contexts = [];
    if (state.kind !== "All") contexts.push(state.kind);
    if (state.query) contexts.push(`“${state.query}”`);
    if (state.discipline) {
      const discipline = state.taxonomy.disciplines.find(item => item.id === state.discipline);
      if (discipline) contexts.push(discipline.name);
    }
    if (state.capability) {
      const capability = state.taxonomy.capabilities.find(item => item.id === state.capability);
      if (capability) contexts.push(capability.name);
    }
    if (state.origin) contexts.push(originLabel(state.origin));
    elements.catalogContext.textContent = contexts.length ? contexts.join(" · ") : "Across the complete atlas";

    elements.grid.replaceChildren();
    if (!resources.length) {
      const empty = create("div", "catalog-empty");
      empty.append(
        create("strong", "", "No matching resources"),
        create("span", "", "Try a broader term or clear one of the filters.")
      );
      elements.grid.append(empty);
    } else {
      const fragment = document.createDocumentFragment();
      for (const resource of resources.slice(0, state.visible)) {
        fragment.append(renderCard(resource));
      }
      elements.grid.append(fragment);
    }
    const more = resources.length > state.visible;
    elements.showMore.parentElement.hidden = !more;
    elements.showMore.textContent = more
      ? `Show ${Math.min(PAGE_SIZE, resources.length - state.visible)} more`
      : "All resources shown";
  }

  function openResourceDialog(resource) {
    const content = elements.dialogContent;
    content.replaceChildren();
    content.append(
      create("span", "dialog-kicker", `${resource.kind} / ${originLabel(resource.origin)}`),
      create("h2", "", resource.name),
      create("p", "dialog-description", resource.description)
    );

    const taxonomy = create("section", "dialog-section");
    taxonomy.append(create("h3", "", "Research classification"));
    const taxonomyTags = create("div", "dialog-tags");
    for (const label of makeTaxonomyTags(resource)) taxonomyTags.append(create("span", "", label));
    taxonomy.append(taxonomyTags);
    content.append(taxonomy);

    if (normalizeArray(resource.tags).length) {
      const topics = create("section", "dialog-section");
      topics.append(create("h3", "", "Knowledge topics"));
      const topicTags = create("div", "dialog-tags");
      for (const tag of normalizeArray(resource.tags)) topicTags.append(create("span", "", tag));
      topics.append(topicTags);
      content.append(topics);
    }

    const sourceSection = create("section", "dialog-section");
    sourceSection.append(
      create("h3", "", "Provenance"),
      create("p", "dialog-description", `${resource.source}${resource.retrievedAt ? ` · retrieved ${resource.retrievedAt}` : ""}`)
    );
    content.append(sourceSection);

    const actions = create("div", "dialog-actions");
    const source = create("a", "button button-primary button-small", "Open source ↗");
    source.href = resource.url;
    source.target = "_blank";
    source.rel = "noreferrer";
    actions.append(source);
    const map = create("button", "button button-quiet button-small", "Find in 3D atlas");
    map.type = "button";
    map.addEventListener("click", () => {
      elements.dialog.close();
      window.A3SGraph?.focusResource(resource.id);
    });
    actions.append(map);
    if (resource.roadmap) {
      const roadmap = create("a", "button button-quiet button-small", "Open roadmap ↗");
      roadmap.href = resource.roadmap.url;
      roadmap.target = "_blank";
      roadmap.rel = "noreferrer";
      actions.append(roadmap);
    }
    content.append(actions);
    elements.dialog.showModal();
  }

  function openFilters() {
    elements.filterPanel.classList.add("is-open");
    elements.filterToggle.setAttribute("aria-expanded", "true");
    elements.filterToggle.lastElementChild.textContent = "−";
  }

  function toggleFilters() {
    const open = elements.filterPanel.classList.toggle("is-open");
    elements.filterToggle.setAttribute("aria-expanded", String(open));
    elements.filterToggle.lastElementChild.textContent = open ? "−" : "＋";
  }

  function clearFilters() {
    state.query = "";
    state.kind = "All";
    state.discipline = "";
    state.capability = "";
    state.origin = "";
    state.visible = PAGE_SIZE;
    elements.search.value = "";
    elements.discipline.value = "";
    elements.capability.value = "";
    elements.origin.value = "";
    renderKindTabs();
    renderCatalog();
    syncUrlState();
  }

  function bindCatalog() {
    elements.search.addEventListener("input", () => {
      state.query = elements.search.value;
      state.visible = PAGE_SIZE;
      renderCatalog();
      syncUrlState();
    });
    elements.discipline.addEventListener("change", () => {
      state.discipline = elements.discipline.value;
      state.visible = PAGE_SIZE;
      renderCatalog();
      syncUrlState();
    });
    elements.capability.addEventListener("change", () => {
      state.capability = elements.capability.value;
      state.visible = PAGE_SIZE;
      renderCatalog();
      syncUrlState();
    });
    elements.origin.addEventListener("change", () => {
      state.origin = elements.origin.value;
      state.visible = PAGE_SIZE;
      renderCatalog();
      syncUrlState();
    });
    elements.filterToggle.addEventListener("click", toggleFilters);
    elements.clear.addEventListener("click", clearFilters);
    elements.showMore.addEventListener("click", () => {
      state.visible += PAGE_SIZE;
      renderCatalog();
    });
    elements.dialog.querySelector(".dialog-close").addEventListener("click", () => elements.dialog.close());
    elements.dialog.addEventListener("click", event => {
      if (event.target === elements.dialog) elements.dialog.close();
    });
  }

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function bindShell() {
    const header = document.querySelector("[data-header]");
    const updateHeader = () => header.classList.toggle("is-compact", window.scrollY > 28);
    window.addEventListener("scroll", updateHeader, { passive: true });
    updateHeader();

    const themeButton = document.querySelector(".theme-toggle");
    const storedTheme = localStorage.getItem("a3s-science-theme");
    if (storedTheme === "dark") document.body.dataset.theme = "dark";
    themeButton.addEventListener("click", () => {
      const dark = document.body.dataset.theme !== "dark";
      if (dark) document.body.dataset.theme = "dark";
      else delete document.body.dataset.theme;
      localStorage.setItem("a3s-science-theme", dark ? "dark" : "light");
    });
  }

  function cacheElements() {
    elements.search = document.getElementById("catalog-search");
    elements.kindTabs = document.getElementById("kind-tabs");
    elements.discipline = document.getElementById("discipline-filter");
    elements.capability = document.getElementById("capability-filter");
    elements.origin = document.getElementById("origin-filter");
    elements.filterPanel = document.getElementById("filter-panel");
    elements.filterToggle = document.querySelector("[data-filter-toggle]");
    elements.clear = document.getElementById("clear-filters");
    elements.catalogCount = document.getElementById("catalog-count");
    elements.catalogContext = document.getElementById("catalog-context");
    elements.grid = document.getElementById("catalog-grid");
    elements.showMore = document.getElementById("show-more");
    elements.disciplineGroups = document.getElementById("discipline-groups");
    elements.dialog = document.getElementById("resource-dialog");
    elements.dialogContent = document.getElementById("resource-dialog-content");
  }

  function showLoadError(error) {
    console.error(error);
    const loading = document.getElementById("graph-loading");
    loading.innerHTML = "";
    loading.append(
      create("strong", "", "The catalog could not be loaded."),
      create("span", "", error.message)
    );
    elements.grid.replaceChildren();
    const empty = create("div", "catalog-empty");
    empty.append(
      create("strong", "", "Catalog data unavailable"),
      create("span", "", "Reload the page or inspect the source data in the repository.")
    );
    elements.grid.append(empty);
  }

  async function init() {
    cacheElements();
    bindShell();
    loadUrlState();
    try {
      const [taxonomy, manifest, native, ecosystem, scienceSoftware, roadmaps] = await Promise.all([
        fetchJson("./data/taxonomy.json"),
        fetchJson("./data/catalog-manifest.json"),
        fetchJsonLines("./data/native.jsonl"),
        fetchJsonLines("./data/ecosystem.jsonl"),
        fetchJsonLines("./data/sciencesoftware.jsonl"),
        fetchJsonLines("./data/roadmaps.jsonl")
      ]);
      state.taxonomy = taxonomy;
      const formattedSnapshotDate = new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "UTC"
      }).format(new Date(`${manifest.snapshotDate}T00:00:00Z`));
      document.querySelectorAll("[data-snapshot-date]").forEach(node => {
        node.textContent = node.dataset.snapshotDate === "iso"
          ? manifest.snapshotDate
          : formattedSnapshotDate;
      });
      state.roadmapMap = new Map(roadmaps.map(roadmap => [roadmap.resourceId, roadmap]));
      state.resources = [...native, ...ecosystem, ...scienceSoftware].map(resource => ({
        ...resource,
        disciplines: normalizeArray(resource.disciplines),
        capabilities: normalizeArray(resource.capabilities),
        tags: normalizeArray(resource.tags),
        roadmap: state.roadmapMap.get(resource.id) || null
      }));
      setMetrics();
      populateSelects();
      renderKindTabs();
      renderDisciplines();
      bindCatalog();
      renderCatalog();
      if (state.discipline || state.capability || state.origin) openFilters();
      window.A3SGraph?.init({ taxonomy: state.taxonomy, resources: state.resources });
    } catch (error) {
      showLoadError(error);
    }
  }

  init();
})();
