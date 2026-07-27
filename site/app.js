(() => {
  "use strict";

  const KIND_ORDER = ["All", "Skill", "MCP", "Software", "Agent", "Workbench"];
  const KIND_LABELS = {
    All: "全部",
    Skill: "科研技能",
    MCP: "MCP 服务",
    Software: "科研软件",
    Agent: "科研智能体",
    Workbench: "科研工作台"
  };
  const KIND_SYMBOLS = {
    Skill: "◇",
    MCP: "⌘",
    Software: "▦",
    Agent: "◎",
    Workbench: "⌂"
  };
  const KIND_COLORS = {
    Skill: "#14a675",
    MCP: "#0f9f87",
    Software: "#2864e8",
    Agent: "#c97816",
    Workbench: "#8b5cf6"
  };
  const GROUP_COLORS = {
    "Cross-disciplinary": "#8b5cf6",
    "Natural Sciences": "#2864e8",
    "Engineering and Technology": "#c97816",
    "Medical and Health Sciences": "#d84b4f",
    "Agricultural and Veterinary Sciences": "#14a675",
    "Social Sciences": "#4c82f0",
    "Humanities and the Arts": "#9b59b6"
  };
  const PAGE_SIZE = 18;
  const state = {
    taxonomy: null,
    manifest: null,
    registry: null,
    resources: [],
    roadmapMap: new Map(),
    packageMap: new Map(),
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

  function taxonomyLookup(entries) {
    return new Map(entries.map(entry => [entry.id, entry]));
  }

  function bilingualLabel(entry) {
    return `${entry.nameZh} / ${entry.name}`;
  }

  function originRank(origin) {
    return { native: 0, ecosystem: 1, sciencesoftware: 2 }[origin] ?? 3;
  }

  function originLabel(origin) {
    return {
      native: "A3S 原生",
      ecosystem: "生态精选",
      sciencesoftware: "ScienceSoftware"
    }[origin] || origin;
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
      mcp: state.resources.filter(resource => resource.kind === "MCP").length,
      roadmaps: state.roadmapMap.size
    };
    for (const [name, value] of Object.entries(metrics)) {
      document.querySelectorAll(`[data-metric="${name}"]`).forEach(node => {
        node.textContent = value.toLocaleString("zh-CN");
      });
    }
    for (const origin of ["native", "ecosystem", "sciencesoftware"]) {
      const count = state.resources.filter(resource => resource.origin === origin).length;
      document.querySelectorAll(`[data-origin-count="${origin}"]`).forEach(node => {
        node.textContent = count.toLocaleString("zh-CN");
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
    elements.globalSearch.value = state.query;
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

  function resourceCountsByDiscipline() {
    const counts = new Map(state.taxonomy.disciplines.map(item => [item.id, 0]));
    for (const resource of state.resources) {
      for (const discipline of resource.disciplines) {
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
      card.style.setProperty("--card-accent", GROUP_COLORS[discipline.group] || "#2864e8");
      card.setAttribute("aria-label", `按${discipline.nameZh}筛选套件`);

      const code = create("div", "discipline-code");
      code.append(document.createTextNode(`${discipline.code} · ${discipline.groupZh}`), create("i"));
      const title = create("h3", "", discipline.nameZh);
      title.append(create("span", "", discipline.name));
      const footer = document.createElement("footer");
      footer.append(
        create("span", "", `${(counts.get(discipline.id) || 0).toLocaleString("zh-CN")} 个套件`),
        create("span", "", "浏览 →")
      );
      card.append(code, title, footer);
      card.addEventListener("click", () => {
        state.discipline = discipline.id;
        state.visible = PAGE_SIZE;
        elements.discipline.value = discipline.id;
        openFilters();
        renderCatalog();
        syncUrlState();
        document.getElementById("catalog").scrollIntoView({
          behavior: prefersReducedMotion() ? "auto" : "smooth"
        });
      });
      elements.disciplineGroups.append(card);
    }
  }

  function resourceSearchText(resource) {
    const packageRecord = resource.package;
    const disciplines = makeTaxonomyTags(resource);
    return [
      resource.name,
      resource.description,
      packageRecord.summaryZh,
      packageRecord.packageName,
      packageRecord.componentId,
      resource.source,
      ...resource.tags,
      ...disciplines
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

  function makeTaxonomyTags(resource) {
    const disciplineMap = taxonomyLookup(state.taxonomy.disciplines);
    const capabilityMap = taxonomyLookup(state.taxonomy.capabilities);
    return [
      ...resource.disciplines.map(id => disciplineMap.get(id)?.nameZh),
      ...resource.capabilities.map(id => capabilityMap.get(id)?.nameZh)
    ].filter(Boolean);
  }

  function renderCard(resource) {
    const card = create("article", "resource-card");
    card.style.setProperty("--card-color", KIND_COLORS[resource.kind] || "#2864e8");

    const topline = create("div", "card-topline");
    const kind = create("span", "kind-badge");
    kind.append(create("i"), document.createTextNode(KIND_LABELS[resource.kind]));
    topline.append(kind, create("span", "origin-badge", originLabel(resource.origin)));

    const title = create("h3", "", resource.name);
    const description = create("p", "", resource.package.summaryZh);
    const taxonomy = create("div", "card-taxonomy");
    for (const label of makeTaxonomyTags(resource).slice(0, 3)) {
      taxonomy.append(create("span", "", label));
    }

    const packageBlock = create("div", "card-package");
    const packageMeta = create("div", "card-package-meta");
    packageMeta.append(
      create("code", "", `${resource.package.packageName} · v${resource.package.version}`),
      create("span", "package-role-badge", resource.package.packageRoleZh)
    );
    const command = create("div", "card-command");
    command.append(
      create("code", "", resource.package.installCommand),
      copyButton(resource.package.installCommand, `复制 ${resource.name} 的安装命令`)
    );
    packageBlock.append(packageMeta, command);

    const actions = create("div", "card-actions");
    const details = create("button", "", "查看详情");
    details.type = "button";
    details.addEventListener("click", () => openResourceDialog(resource));
    actions.append(details);
    const source = create("a", "", "原始项目 ↗");
    source.href = resource.url;
    source.target = "_blank";
    source.rel = "noreferrer";
    actions.append(source);
    if (resource.roadmap) {
      const roadmap = create("a", "", "研发路线图 ↗");
      roadmap.href = resource.roadmap.url;
      roadmap.target = "_blank";
      roadmap.rel = "noreferrer";
      actions.append(roadmap);
    }
    card.append(topline, title, description, taxonomy, packageBlock, actions);
    return card;
  }

  function renderCatalog() {
    const resources = filteredResources();
    elements.catalogCount.textContent = resources.length.toLocaleString("zh-CN");
    const contexts = [];
    if (state.kind !== "All") contexts.push(KIND_LABELS[state.kind]);
    if (state.query) contexts.push(`“${state.query}”`);
    if (state.discipline) {
      const item = state.taxonomy.disciplines.find(entry => entry.id === state.discipline);
      if (item) contexts.push(item.nameZh);
    }
    if (state.capability) {
      const item = state.taxonomy.capabilities.find(entry => entry.id === state.capability);
      if (item) contexts.push(item.nameZh);
    }
    if (state.origin) contexts.push(originLabel(state.origin));
    elements.catalogContext.textContent = contexts.length ? contexts.join(" · ") : "全部套件";

    elements.grid.replaceChildren();
    if (!resources.length) {
      const empty = create("div", "catalog-empty");
      empty.append(
        create("strong", "", "没有找到匹配的科研套件"),
        create("span", "", "请尝试更宽泛的关键词，或清除一个筛选条件。")
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

  function copyButton(command, label = "复制命令") {
    const button = create("button", "", "复制");
    button.type = "button";
    button.dataset.copyCommand = command;
    button.setAttribute("aria-label", label);
    return button;
  }

  function dialogCommandRow(label, command) {
    const row = create("div", "dialog-command-row");
    row.append(create("span", "", label), create("code", "", command), copyButton(command));
    return row;
  }

  function openResourceDialog(resource) {
    const content = elements.dialogContent;
    content.replaceChildren();
    content.style.setProperty("--dialog-color", KIND_COLORS[resource.kind] || "#2864e8");

    const identity = create("div", "dialog-identity");
    identity.append(create("span", "dialog-icon", KIND_SYMBOLS[resource.kind] || "◇"));
    const identityCopy = document.createElement("div");
    identityCopy.append(
      create("span", "dialog-kicker", `${KIND_LABELS[resource.kind]} · ${originLabel(resource.origin)}`),
      create("h2", "", resource.name)
    );
    identity.append(identityCopy);
    content.append(identity, create("p", "dialog-description", resource.package.summaryZh));

    const packageSection = create("section", "dialog-section");
    packageSection.append(create("h3", "", "A3S 包管理"));
    const packageCard = create("div", "dialog-package-card");
    const packageHeader = create("div", "dialog-package-header");
    packageHeader.append(
      create("code", "", resource.package.packageName),
      create("span", "", `${resource.package.packageRoleZh} · v${resource.package.version}`)
    );
    const commands = create("div", "dialog-command-list");
    commands.append(
      dialogCommandRow("安装", resource.package.installCommand),
      dialogCommandRow("升级", resource.package.upgradeCommand),
      dialogCommandRow("卸载", resource.package.uninstallCommand)
    );
    packageCard.append(
      packageHeader,
      create("p", "", `安装内容：${resource.package.installContentZh}`),
      commands
    );
    packageSection.append(packageCard);
    content.append(packageSection);

    const taxonomy = create("section", "dialog-section");
    taxonomy.append(create("h3", "", "科研分类"));
    const taxonomyTags = create("div", "dialog-tags");
    for (const label of makeTaxonomyTags(resource)) taxonomyTags.append(create("span", "", label));
    taxonomy.append(taxonomyTags);
    content.append(taxonomy);

    if (resource.tags.length) {
      const topics = create("section", "dialog-section");
      topics.append(create("h3", "", "知识主题"));
      const topicTags = create("div", "dialog-tags");
      for (const tag of resource.tags) topicTags.append(create("span", "", tag));
      topics.append(topicTags);
      content.append(topics);
    }

    const provenance = create("section", "dialog-section");
    provenance.append(
      create("h3", "", "来源与快照"),
      create(
        "p",
        "dialog-description",
        `${resource.source}${resource.retrievedAt ? ` · 抓取于 ${resource.retrievedAt}` : ""}`
      )
    );
    content.append(provenance);

    const actions = create("div", "dialog-actions");
    const source = create("a", "button button-primary button-small", "打开原始项目 ↗");
    source.href = resource.url;
    source.target = "_blank";
    source.rel = "noreferrer";
    const map = create("button", "button button-secondary button-small", "在 3D 图谱中定位");
    map.type = "button";
    map.addEventListener("click", () => {
      elements.dialog.close();
      window.A3SGraph?.focusResource(resource.id);
    });
    actions.append(source, map);
    if (resource.roadmap) {
      const roadmap = create("a", "button button-secondary button-small", "打开研发路线图 ↗");
      roadmap.href = resource.roadmap.url;
      roadmap.target = "_blank";
      roadmap.rel = "noreferrer";
      actions.append(roadmap);
    }
    content.append(actions);
    elements.dialog.showModal();
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
    showToast();
  }

  function showToast() {
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
    elements.globalSearch.value = "";
    elements.discipline.value = "";
    elements.capability.value = "";
    elements.origin.value = "";
    renderKindTabs();
    renderCatalog();
    syncUrlState();
  }

  function bindCatalog() {
    const updateQuery = value => {
      state.query = value;
      state.visible = PAGE_SIZE;
      elements.search.value = value;
      elements.globalSearch.value = value;
      renderCatalog();
      syncUrlState();
    };
    elements.search.addEventListener("input", () => updateQuery(elements.search.value));
    elements.globalSearch.addEventListener("input", () => updateQuery(elements.globalSearch.value));
    elements.globalSearch.addEventListener("keydown", event => {
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
    elements.dialog.querySelector(".dialog-close").addEventListener("click", () => elements.dialog.close());
    elements.dialog.addEventListener("click", event => {
      if (event.target === elements.dialog) elements.dialog.close();
    });
  }

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function bindCopyActions() {
    document.addEventListener("click", event => {
      const commandButton = event.target.closest("[data-copy-command]");
      if (commandButton) {
        copyCommand(commandButton.dataset.copyCommand);
        return;
      }
      const targetButton = event.target.closest("[data-copy-target]");
      if (targetButton) {
        const target = document.getElementById(targetButton.dataset.copyTarget);
        if (target) copyCommand(target.textContent.trim());
      }
    });
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
    elements.globalSearch = document.getElementById("global-search");
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
    elements.toast = document.getElementById("copy-toast");
  }

  function showLoadError(error) {
    console.error(error);
    const loading = document.getElementById("graph-loading");
    loading.replaceChildren(
      create("strong", "", "科研目录加载失败"),
      create("span", "", error.message)
    );
    elements.grid.replaceChildren();
    const empty = create("div", "catalog-empty");
    empty.append(
      create("strong", "", "目录数据暂不可用"),
      create("span", "", "请刷新页面，或在 GitHub 仓库中查看原始数据。")
    );
    elements.grid.append(empty);
  }

  async function init() {
    cacheElements();
    bindShell();
    bindCopyActions();
    loadUrlState();
    try {
      const [taxonomy, manifest, registry, native, ecosystem, scienceSoftware, roadmaps, packages] =
        await Promise.all([
          fetchJson("./data/taxonomy.json"),
          fetchJson("./data/catalog-manifest.json"),
          fetchJson("./registry/index.json"),
          fetchJsonLines("./data/native.jsonl"),
          fetchJsonLines("./data/ecosystem.jsonl"),
          fetchJsonLines("./data/sciencesoftware.jsonl"),
          fetchJsonLines("./data/roadmaps.jsonl"),
          fetchJsonLines("./data/packages.jsonl")
        ]);
      state.taxonomy = taxonomy;
      state.manifest = manifest;
      state.registry = registry;
      state.roadmapMap = new Map(roadmaps.map(roadmap => [roadmap.resourceId, roadmap]));
      state.packageMap = new Map(packages.map(packageRecord => [packageRecord.resourceId, packageRecord]));
      state.resources = [...native, ...ecosystem, ...scienceSoftware].map(resource => {
        const packageRecord = state.packageMap.get(resource.id);
        if (!packageRecord) throw new Error(`资源 ${resource.id} 缺少 A3S 包记录`);
        return {
          ...resource,
          disciplines: normalizeArray(resource.disciplines),
          capabilities: normalizeArray(resource.capabilities),
          tags: normalizeArray(resource.tags),
          roadmap: state.roadmapMap.get(resource.id) || null,
          package: packageRecord
        };
      });
      if (state.resources.length !== state.packageMap.size) {
        throw new Error("科研资源与 A3S 包数量不一致");
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
      renderDisciplines();
      bindCatalog();
      renderCatalog();
      if (state.discipline || state.capability || state.origin) openFilters();
      window.A3SGraph?.init({ taxonomy: state.taxonomy, resources: state.resources });
      window.A3SApp = {
        openResource(resourceId) {
          const resource = state.resources.find(item => item.id === resourceId);
          if (resource) openResourceDialog(resource);
        }
      };
    } catch (error) {
      showLoadError(error);
    }
  }

  init();
})();
