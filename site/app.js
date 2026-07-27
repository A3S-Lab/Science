(() => {
  "use strict";

  const KIND_ORDER = ["All", "Skill", "MCP", "Software", "Agent", "Workbench"];
  const KIND_LABELS = {
    All: "全部",
    Skill: "Skill",
    MCP: "MCP 服务",
    Software: "科研软件",
    Agent: "智能体",
    Workbench: "工作台"
  };
  const KIND_COLORS = {
    Skill: "#14a675",
    MCP: "#0f9f87",
    Software: "#2864e8",
    Agent: "#c97816",
    Workbench: "#8b5cf6"
  };
  const PAGE_SIZE = 24;
  const state = {
    taxonomy: null,
    manifest: null,
    registry: null,
    resources: [],
    packageMap: new Map(),
    disciplineMap: new Map(),
    capabilityMap: new Map(),
    kind: "All",
    query: "",
    discipline: "",
    capability: "",
    origin: "",
    visible: PAGE_SIZE
  };
  const elements = {};
  let toastTimer = null;

  function normalizeArray(value) {
    if (Array.isArray(value)) return value;
    return value ? [value] : [];
  }

  async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`无法加载 ${url}：${response.status}`);
    return response.json();
  }

  async function fetchJsonLines(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`无法加载 ${url}：${response.status}`);
    const text = await response.text();
    return text
      .split(/\r?\n/)
      .filter(line => line.trim())
      .map((line, index) => {
        try {
          return JSON.parse(line);
        } catch (error) {
          throw new Error(`${url} 第 ${index + 1} 行不是有效 JSON：${error.message}`);
        }
      });
  }

  function create(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function bilingualLabel(entry) {
    return `${entry.nameZh} / ${entry.name}`;
  }

  function originRank(origin) {
    return { native: 0, ecosystem: 1, sciencesoftware: 2 }[origin] ?? 3;
  }

  function originLabel(origin) {
    return {
      native: "A3S Science",
      ecosystem: "开源项目",
      sciencesoftware: "ScienceSoftware"
    }[origin] || origin;
  }

  function resourceUrl(resourceId) {
    return `./resources/${encodeURIComponent(resourceId)}/`;
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
      packages: state.packageMap.size,
      disciplines: state.taxonomy.disciplines.length,
      skills: state.resources.filter(resource => resource.kind === "Skill").length,
      mcp: state.resources.filter(resource => resource.kind === "MCP").length
    };
    for (const [name, value] of Object.entries(metrics)) {
      document.querySelectorAll(`[data-metric="${name}"]`).forEach(node => {
        node.textContent = value.toLocaleString("zh-CN");
      });
    }
  }

  function populateSelects() {
    for (const discipline of state.taxonomy.disciplines) {
      const option = document.createElement("option");
      option.value = discipline.id;
      option.textContent = `${discipline.code} · ${bilingualLabel(discipline)}`;
      elements.discipline.append(option);
    }
    for (const capability of state.taxonomy.capabilities) {
      const option = document.createElement("option");
      option.value = capability.id;
      option.textContent = bilingualLabel(capability);
      elements.capability.append(option);
    }
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
      button.append(document.createTextNode(KIND_LABELS[kind]), create("span", "", count.toLocaleString("zh-CN")));
      button.addEventListener("click", () => setKind(kind));
      elements.kindTabs.append(button);
    }
  }

  function setKind(kind, shouldScroll = false) {
    state.kind = kind;
    state.visible = PAGE_SIZE;
    renderKindTabs();
    renderCatalog();
    syncUrlState();
    if (shouldScroll) {
      document.getElementById("catalog").scrollIntoView({
        behavior: prefersReducedMotion() ? "auto" : "smooth"
      });
    }
  }

  function taxonomyNames(ids, lookup, limit = Number.POSITIVE_INFINITY) {
    return normalizeArray(ids)
      .map(id => lookup.get(id)?.nameZh)
      .filter(Boolean)
      .slice(0, limit);
  }

  function resourceSummary(resource) {
    if (resource.origin === "sciencesoftware" || resource.language?.toLocaleLowerCase().startsWith("zh")) {
      return resource.description;
    }
    const disciplines = taxonomyNames(resource.disciplines, state.disciplineMap, 2);
    const capabilities = taxonomyNames(resource.capabilities, state.capabilityMap, 2);
    return [KIND_LABELS[resource.kind], disciplines.join("、"), capabilities.join("、")]
      .filter(Boolean)
      .join(" · ");
  }

  function resourceSearchText(resource) {
    return [
      resource.name,
      resource.description,
      resource.package.summaryZh,
      resource.package.packageName,
      resource.package.componentId,
      resource.source,
      ...resource.tags,
      ...taxonomyNames(resource.disciplines, state.disciplineMap),
      ...taxonomyNames(resource.capabilities, state.capabilityMap)
    ].join(" ").toLocaleLowerCase();
  }

  function filteredResources() {
    const query = state.query.trim().toLocaleLowerCase();
    return state.resources
      .filter(resource => state.kind === "All" || resource.kind === state.kind)
      .filter(resource => !state.discipline || resource.disciplines.includes(state.discipline))
      .filter(resource => !state.capability || resource.capabilities.includes(state.capability))
      .filter(resource => !state.origin || resource.origin === state.origin)
      .filter(resource => !query || resourceSearchText(resource).includes(query))
      .sort((left, right) =>
        Number(right.featured) - Number(left.featured) ||
        originRank(left.origin) - originRank(right.origin) ||
        left.name.localeCompare(right.name)
      );
  }

  function resourceTags(resource) {
    return [
      ...taxonomyNames(resource.disciplines, state.disciplineMap),
      ...taxonomyNames(resource.capabilities, state.capabilityMap)
    ];
  }

  function renderCard(resource) {
    const card = create("a", "resource-card");
    card.href = resourceUrl(resource.id);
    card.style.setProperty("--card-color", KIND_COLORS[resource.kind] || "#2864e8");
    card.setAttribute("aria-label", `查看 ${resource.name} 详情`);

    const topline = create("div", "card-topline");
    const kind = create("span", "kind-badge");
    kind.append(create("i"), document.createTextNode(KIND_LABELS[resource.kind]));
    topline.append(kind, create("span", "origin-badge", originLabel(resource.origin)));

    const title = create("h3", "", resource.name);
    const description = create("p", "", resourceSummary(resource));
    const taxonomy = create("div", "card-taxonomy");
    for (const label of resourceTags(resource).slice(0, 3)) {
      taxonomy.append(create("span", "", label));
    }

    const footer = create("footer", "card-footer");
    footer.append(
      create("code", "", resource.package.packageName),
      create("span", "", "详情 →")
    );

    card.append(topline, title, description, taxonomy, footer);
    return card;
  }

  function renderCatalog() {
    const resources = filteredResources();
    elements.catalogCount.textContent = resources.length.toLocaleString("zh-CN");
    const contexts = [];
    if (state.kind !== "All") contexts.push(KIND_LABELS[state.kind]);
    if (state.query) contexts.push(`“${state.query}”`);
    if (state.discipline) {
      const item = state.disciplineMap.get(state.discipline);
      if (item) contexts.push(item.nameZh);
    }
    if (state.capability) {
      const item = state.capabilityMap.get(state.capability);
      if (item) contexts.push(item.nameZh);
    }
    if (state.origin) contexts.push(originLabel(state.origin));
    elements.catalogContext.textContent = contexts.length ? contexts.join(" · ") : "全部资源";

    elements.grid.replaceChildren();
    if (!resources.length) {
      const empty = create("div", "catalog-empty");
      empty.append(
        create("strong", "", "没有匹配的资源"),
        create("span", "", "请更换关键词或清除筛选条件。")
      );
      elements.grid.append(empty);
    } else {
      const fragment = document.createDocumentFragment();
      for (const resource of resources.slice(0, state.visible)) fragment.append(renderCard(resource));
      elements.grid.append(fragment);
    }
    const more = resources.length > state.visible;
    elements.showMore.parentElement.hidden = !more;
    elements.showMore.textContent = more
      ? `再加载 ${Math.min(PAGE_SIZE, resources.length - state.visible)} 个`
      : "已显示全部";
  }

  async function copyCommand(command) {
    try {
      await navigator.clipboard.writeText(command);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = command;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.append(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    clearTimeout(toastTimer);
    elements.toast.hidden = false;
    toastTimer = window.setTimeout(() => {
      elements.toast.hidden = true;
    }, 1700);
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
    Object.assign(state, {
      query: "",
      kind: "All",
      discipline: "",
      capability: "",
      origin: "",
      visible: PAGE_SIZE
    });
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
    elements.search.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        document.getElementById("catalog").scrollIntoView({
          behavior: prefersReducedMotion() ? "auto" : "smooth"
        });
      }
    });
    for (const [element, key] of [
      [elements.discipline, "discipline"],
      [elements.capability, "capability"],
      [elements.origin, "origin"]
    ]) {
      element.addEventListener("change", () => {
        state[key] = element.value;
        state.visible = PAGE_SIZE;
        renderCatalog();
        syncUrlState();
      });
    }
    elements.filterToggle.addEventListener("click", toggleFilters);
    elements.clear.addEventListener("click", clearFilters);
    elements.showMore.addEventListener("click", () => {
      state.visible += PAGE_SIZE;
      renderCatalog();
    });
  }

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function bindShell() {
    const openButton = document.querySelector("[data-sidebar-open]");
    const closeButtons = document.querySelectorAll("[data-sidebar-close]");
    const scrim = document.querySelector(".mobile-scrim");
    const closeSidebar = () => {
      document.body.classList.remove("is-sidebar-open");
      scrim.hidden = true;
    };
    openButton.addEventListener("click", () => {
      document.body.classList.add("is-sidebar-open");
      scrim.hidden = false;
    });
    closeButtons.forEach(button => button.addEventListener("click", closeSidebar));
    document.querySelectorAll(".sidebar-nav a").forEach(link => link.addEventListener("click", closeSidebar));

    const themeButton = document.querySelector(".theme-toggle");
    const storedTheme = localStorage.getItem("a3s-science-theme");
    if (storedTheme === "dark") document.body.dataset.theme = "dark";
    themeButton.addEventListener("click", () => {
      const dark = document.body.dataset.theme !== "dark";
      if (dark) document.body.dataset.theme = "dark";
      else delete document.body.dataset.theme;
      localStorage.setItem("a3s-science-theme", dark ? "dark" : "light");
    });

    document.querySelectorAll("[data-kind-filter]").forEach(button => {
      button.addEventListener("click", () => {
        setKind(button.dataset.kindFilter, true);
        closeSidebar();
      });
    });
    document.addEventListener("click", event => {
      const targetButton = event.target.closest("[data-copy-target]");
      if (!targetButton) return;
      const target = document.getElementById(targetButton.dataset.copyTarget);
      if (target) copyCommand(target.textContent.trim());
    });
    document.addEventListener("keydown", event => {
      const tag = document.activeElement?.tagName;
      if (event.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(tag)) {
        event.preventDefault();
        elements.search.focus();
      }
    });

    if (window.IntersectionObserver) {
      const links = new Map(
        [...document.querySelectorAll("[data-nav-link]")].map(link => [link.dataset.navLink, link])
      );
      const observer = new IntersectionObserver(entries => {
        const visible = entries
          .filter(entry => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
        if (!visible) return;
        links.forEach(link => link.classList.remove("is-active"));
        links.get(visible.target.id)?.classList.add("is-active");
      }, { rootMargin: "-20% 0px -68% 0px", threshold: [0, 0.1, 0.4] });
      links.forEach((_, id) => {
        const section = document.getElementById(id);
        if (section) observer.observe(section);
      });
    }
  }

  function cacheElements() {
    elements.search = document.getElementById("global-search");
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
    elements.toast = document.getElementById("copy-toast");
  }

  function showLoadError(error) {
    console.error(error);
    const loading = document.getElementById("graph-loading");
    loading.replaceChildren(
      create("strong", "", "目录加载失败"),
      create("span", "", error.message)
    );
    elements.grid.replaceChildren();
    const empty = create("div", "catalog-empty");
    empty.append(
      create("strong", "", "目录数据暂不可用"),
      create("span", "", "请刷新页面，或在 GitHub 仓库中查看数据文件。")
    );
    elements.grid.append(empty);
  }

  async function init() {
    cacheElements();
    bindShell();
    loadUrlState();
    try {
      const [taxonomy, manifest, registry, native, ecosystem, scienceSoftware, packages] =
        await Promise.all([
          fetchJson("./data/taxonomy.json"),
          fetchJson("./data/catalog-manifest.json"),
          fetchJson("./registry/index.json"),
          fetchJsonLines("./data/native.jsonl"),
          fetchJsonLines("./data/ecosystem.jsonl"),
          fetchJsonLines("./data/sciencesoftware.jsonl"),
          fetchJsonLines("./data/packages.jsonl")
        ]);
      state.taxonomy = taxonomy;
      state.manifest = manifest;
      state.registry = registry;
      state.disciplineMap = new Map(taxonomy.disciplines.map(item => [item.id, item]));
      state.capabilityMap = new Map(taxonomy.capabilities.map(item => [item.id, item]));
      state.packageMap = new Map(packages.map(packageRecord => [packageRecord.resourceId, packageRecord]));
      state.resources = [...native, ...ecosystem, ...scienceSoftware].map(resource => {
        const packageRecord = state.packageMap.get(resource.id);
        if (!packageRecord) throw new Error(`资源 ${resource.id} 缺少 A3S 包记录`);
        return {
          ...resource,
          disciplines: normalizeArray(resource.disciplines),
          capabilities: normalizeArray(resource.capabilities),
          tags: normalizeArray(resource.tags),
          package: packageRecord
        };
      });
      if (state.resources.length !== state.packageMap.size) {
        throw new Error("资源数量与包数量不一致");
      }

      const formattedDate = new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "UTC"
      }).format(new Date(`${manifest.snapshotDate}T00:00:00Z`));
      document.querySelectorAll("[data-snapshot-date]").forEach(node => {
        node.textContent = node.dataset.snapshotDate === "iso" ? manifest.snapshotDate : formattedDate;
      });
      document.getElementById("registry-enroll-command").textContent = registry.enrollCommand;

      setMetrics();
      populateSelects();
      renderKindTabs();
      bindCatalog();
      renderCatalog();
      if (state.discipline || state.capability || state.origin) openFilters();
      window.A3SGraph?.init({ taxonomy: state.taxonomy, resources: state.resources });
      const graphResource = new URLSearchParams(window.location.search).get("graph");
      if (graphResource) window.A3SGraph?.focusResource(graphResource);
      window.A3SApp = {
        openResource(resourceId) {
          window.location.href = resourceUrl(resourceId);
        }
      };
    } catch (error) {
      showLoadError(error);
    }
  }

  init();
})();
