(() => {
  "use strict";

  const KIND_LABELS = {
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
  const ORIGIN_LABELS = {
    native: "A3S Science",
    ecosystem: "开源项目",
    sciencesoftware: "ScienceSoftware"
  };
  const STATUS_LABELS = {
    Included: "仓库内资源",
    Curated: "目录收录",
    External: "外部资源"
  };
  const LANGUAGE_LABELS = {
    en: "英语",
    "zh-CN": "简体中文"
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
      .map(line => JSON.parse(line));
  }

  function create(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function setText(id, value) {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  }

  function taxonomyNames(ids, lookup, limit = Number.POSITIVE_INFINITY) {
    return normalizeArray(ids)
      .map(id => lookup.get(id)?.nameZh)
      .filter(Boolean)
      .slice(0, limit);
  }

  function conciseSummary(resource, disciplineMap, capabilityMap) {
    if (resource.origin === "sciencesoftware" || resource.language?.toLocaleLowerCase().startsWith("zh")) {
      return resource.description;
    }
    const disciplines = taxonomyNames(resource.disciplines, disciplineMap, 2).join("、");
    const capabilities = taxonomyNames(resource.capabilities, capabilityMap, 2).join("、");
    const parts = [KIND_LABELS[resource.kind]];
    if (disciplines) parts.push(`学科：${disciplines}`);
    if (capabilities) parts.push(`用途：${capabilities}`);
    return `${parts.join("；")}。`;
  }

  function boundaryText(resource) {
    if (resource.origin === "native") {
      return "此记录对应 A3S Science 仓库中的资源。具体脚本、参考资料和运行要求以仓库内容为准。";
    }
    if (resource.origin === "ecosystem") {
      return "A3S 保存目录信息和适配说明。许可证、依赖、维护状态和运行方式以来源项目为准。";
    }
    return "A3S 保存目录信息，不分发或代替原厂程序。";
  }

  function renderTags(resource) {
    elements.tags.replaceChildren();
    for (const tag of normalizeArray(resource.tags)) {
      elements.tags.append(create("span", "", tag));
    }
  }

  function renderTaxonomy(resource, disciplineMap, capabilityMap) {
    elements.disciplines.replaceChildren();
    for (const id of normalizeArray(resource.disciplines)) {
      const entry = disciplineMap.get(id);
      if (!entry) continue;
      const link = create("a", "taxonomy-item");
      link.href = `../../?discipline=${encodeURIComponent(id)}#catalog`;
      link.append(
        create("strong", "", `${entry.code} · ${entry.nameZh}`),
        create("span", "", entry.name)
      );
      elements.disciplines.append(link);
    }

    elements.capabilities.replaceChildren();
    for (const id of normalizeArray(resource.capabilities)) {
      const entry = capabilityMap.get(id);
      if (!entry) continue;
      const link = create("a", "taxonomy-item");
      link.href = `../../?capability=${encodeURIComponent(id)}#catalog`;
      link.append(
        create("strong", "", entry.nameZh),
        create("span", "", entry.name)
      );
      elements.capabilities.append(link);
    }
  }

  function appendMetadata(term, value) {
    elements.metadata.append(create("dt", "", term), create("dd", "", value || "—"));
  }

  function renderMetadata(resource, packageRecord) {
    elements.metadata.replaceChildren();
    appendMetadata("类型", KIND_LABELS[resource.kind] || resource.kind);
    appendMetadata("来源", ORIGIN_LABELS[resource.origin] || resource.origin);
    appendMetadata("状态", STATUS_LABELS[resource.status] || resource.status);
    appendMetadata("语言", LANGUAGE_LABELS[resource.language] || resource.language);
    appendMetadata("来源编号", String(resource.sourceId));
    if (resource.sourceCategory) appendMetadata("原目录分类", resource.sourceCategory);
    if (resource.retrievedAt) appendMetadata("目录快照", resource.retrievedAt);
    appendMetadata("A3S 版本", packageRecord.version);
    appendMetadata("目标平台", packageRecord.target === "any" ? "跨平台" : packageRecord.target);
  }

  function renderPackage(packageRecord) {
    setText("package-version", `v${packageRecord.version} · ${packageRecord.channel}`);
    setText("package-name", packageRecord.packageName);
    setText("package-role", packageRecord.packageRoleZh);
    setText("package-content", packageRecord.installContentZh);
    setText("install-command", packageRecord.installCommand);
    setText("upgrade-command", packageRecord.upgradeCommand);
    setText("uninstall-command", packageRecord.uninstallCommand);
  }

  function sharedCount(left, right) {
    const rightSet = new Set(normalizeArray(right));
    return normalizeArray(left).filter(item => rightSet.has(item)).length;
  }

  function relatedScore(current, candidate) {
    return (
      sharedCount(current.disciplines, candidate.disciplines) * 3 +
      sharedCount(current.capabilities, candidate.capabilities) * 2 +
      Number(current.kind === candidate.kind) +
      Number(candidate.featured) * 0.25
    );
  }

  function renderRelated(current, resources, disciplineMap, capabilityMap) {
    const related = resources
      .filter(resource => resource.id !== current.id)
      .map(resource => ({ resource, score: relatedScore(current, resource) }))
      .filter(item => item.score > 0)
      .sort((left, right) =>
        right.score - left.score ||
        left.resource.name.localeCompare(right.resource.name)
      )
      .slice(0, 6);

    elements.related.replaceChildren();
    for (const item of related) {
      const resource = item.resource;
      const link = create("a", "related-card");
      link.href = `../${encodeURIComponent(resource.id)}/`;
      link.append(
        create("span", "", KIND_LABELS[resource.kind] || resource.kind),
        create("strong", "", resource.name),
        create("p", "", conciseSummary(resource, disciplineMap, capabilityMap))
      );
      elements.related.append(link);
    }
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
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

  function bindPageControls() {
    const storedTheme = localStorage.getItem("a3s-science-theme");
    if (storedTheme === "dark") document.body.dataset.theme = "dark";
    document.querySelector(".detail-theme").addEventListener("click", () => {
      const dark = document.body.dataset.theme !== "dark";
      if (dark) document.body.dataset.theme = "dark";
      else delete document.body.dataset.theme;
      localStorage.setItem("a3s-science-theme", dark ? "dark" : "light");
    });
    document.addEventListener("click", event => {
      const button = event.target.closest("[data-copy-target]");
      if (!button) return;
      const target = document.getElementById(button.dataset.copyTarget);
      if (target) copyText(target.textContent.trim());
    });
  }

  function cacheElements() {
    elements.tags = document.getElementById("resource-tags");
    elements.disciplines = document.getElementById("resource-disciplines");
    elements.capabilities = document.getElementById("resource-capabilities");
    elements.metadata = document.getElementById("resource-metadata");
    elements.related = document.getElementById("related-resources");
    elements.toast = document.getElementById("copy-toast");
  }

  function showError(error) {
    console.error(error);
    setText("resource-summary", "无法加载这条资源记录。");
    setText("resource-description", error.message);
    document.querySelector(".package-card").hidden = true;
  }

  async function init() {
    cacheElements();
    bindPageControls();
    const resourceId = document.body.dataset.resourceId;
    try {
      const [taxonomy, native, ecosystem, scienceSoftware, packages] = await Promise.all([
        fetchJson("../../data/taxonomy.json"),
        fetchJsonLines("../../data/native.jsonl"),
        fetchJsonLines("../../data/ecosystem.jsonl"),
        fetchJsonLines("../../data/sciencesoftware.jsonl"),
        fetchJsonLines("../../data/packages.jsonl")
      ]);
      const resources = [...native, ...ecosystem, ...scienceSoftware].map(resource => ({
        ...resource,
        disciplines: normalizeArray(resource.disciplines),
        capabilities: normalizeArray(resource.capabilities),
        tags: normalizeArray(resource.tags)
      }));
      const resource = resources.find(item => item.id === resourceId);
      const packageRecord = packages.find(item => item.resourceId === resourceId);
      if (!resource) throw new Error(`资源 ${resourceId} 不存在`);
      if (!packageRecord) throw new Error(`资源 ${resourceId} 缺少 A3S 包记录`);

      const disciplineMap = new Map(taxonomy.disciplines.map(item => [item.id, item]));
      const capabilityMap = new Map(taxonomy.capabilities.map(item => [item.id, item]));
      const summary = conciseSummary(resource, disciplineMap, capabilityMap);

      document.body.style.setProperty("--resource-color", KIND_COLORS[resource.kind] || "#2864e8");
      document.title = `${resource.name}｜A3S 科研资源`;
      setText("resource-kind", KIND_LABELS[resource.kind] || resource.kind);
      setText("resource-origin", ORIGIN_LABELS[resource.origin] || resource.origin);
      setText("resource-name", resource.name);
      setText("resource-summary", summary);
      setText("resource-description", resource.description);
      setText("resource-boundary", boundaryText(resource));
      setText("source-name", `${resource.source} · ${resource.sourceId}`);

      elements.sourceLink = document.getElementById("source-link");
      elements.sourceLink.href = resource.url;
      renderTags(resource);
      renderTaxonomy(resource, disciplineMap, capabilityMap);
      renderMetadata(resource, packageRecord);
      renderPackage(packageRecord);
      renderRelated(resource, resources, disciplineMap, capabilityMap);
    } catch (error) {
      showError(error);
    }
  }

  init();
})();
