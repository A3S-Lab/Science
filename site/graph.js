(() => {
  "use strict";

  const COLORS = {
    root: "#6ca3ff",
    group: "#75a9ff",
    discipline: "#4c82f0",
    capabilityHub: "#3ccf91",
    capability: "#2ebd84",
    knowledgeHub: "#a78bfa",
    topic: "#9b7af5",
    Skill: "#3ccf91",
    MCP: "#2dd4bf",
    Software: "#7aa7ff",
    Agent: "#eda94c",
    Workbench: "#c084fc"
  };

  const TYPE_LABELS = {
    root: "图谱根节点",
    group: "学科门类",
    discipline: "研究学科",
    capabilityHub: "科研能力轴",
    capability: "科研能力",
    knowledgeHub: "知识主题轴",
    topic: "知识主题"
  };

  const KIND_LABELS = {
    Skill: "科研技能",
    MCP: "MCP 服务",
    Software: "科研软件",
    Agent: "科研智能体",
    Workbench: "科研工作台"
  };

  const TOPIC_LABELS = {
    "Literature review": "文献综述",
    "Evidence synthesis": "证据综合",
    Citations: "引文",
    Bioinformatics: "生物信息学",
    "Drug discovery": "药物发现",
    "Protein structure": "蛋白质结构",
    "Molecular dynamics": "分子动力学",
    Docking: "分子对接",
    "Virtual screening": "虚拟筛选",
    Genomics: "基因组学",
    Proteomics: "蛋白质组学",
    "Single-cell": "单细胞分析",
    Chemistry: "化学",
    "Scientific visualization": "科学可视化",
    Statistics: "统计学",
    Simulation: "仿真",
    "Machine learning": "机器学习",
    "Deep learning": "深度学习",
    "Agent skills": "智能体技能",
    "Skill library": "技能库",
    "Research workflow": "科研工作流",
    "Data analysis": "数据分析",
    "Materials science": "材料科学",
    Medicine: "医学",
    Ecology: "生态学",
    Reproducibility: "可复现性"
  };

  const MAX_NODES = 600;
  const MAX_LINKS = 4000;
  const MAX_LABELS = 24;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const state = {
    taxonomy: null,
    resources: [],
    graph: null,
    graphData: { nodes: [], links: [] },
    nodesById: new Map(),
    neighbors: new Map(),
    selectedId: null,
    hoveredId: null,
    scope: "overview",
    mode: "3d",
    search: "",
    labelFrame: null,
    fitted: false,
    webgl: true
  };

  const elements = {};

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalizeArray(value) {
    if (Array.isArray(value)) return value;
    return value ? [value] : [];
  }

  function nodeId(value) {
    return typeof value === "object" && value !== null ? value.id : value;
  }

  function supportsWebGL() {
    try {
      const canvas = document.createElement("canvas");
      return Boolean(
        window.WebGLRenderingContext &&
        (canvas.getContext("webgl2") || canvas.getContext("webgl"))
      );
    } catch {
      return false;
    }
  }

  function resourceSubset() {
    const all = state.resources;
    if (state.scope === "all") return all;
    if (state.scope === "agentic") {
      return all.filter(resource => ["Skill", "MCP", "Agent"].includes(resource.kind));
    }
    if (state.scope === "software") {
      return all.filter(resource => ["Software", "Workbench"].includes(resource.kind));
    }

    const overview = all.filter(resource =>
      resource.featured || resource.origin === "native"
    );
    const representedProfiles = new Set();
    for (const resource of all) {
      if (
        resource.roadmap &&
        !representedProfiles.has(resource.roadmap.profileId)
      ) {
        overview.push(resource);
        representedProfiles.add(resource.roadmap.profileId);
      }
    }
    return [...new Map(overview.map(resource => [resource.id, resource])).values()];
  }

  function topicFrequency(resources) {
    const counts = new Map();
    const ignored = new Set([
      "Commercial catalog",
      "Economics and Social Science",
      "Life Science and Chemistry",
      "Engineering Science",
      "Power Simulation",
      "Earth and Geography",
      "Scholarly Communication",
      "Research Computing"
    ]);
    for (const resource of resources) {
      for (const tag of normalizeArray(resource.tags)) {
        const clean = String(tag).trim();
        if (!clean || ignored.has(clean)) continue;
        counts.set(clean, (counts.get(clean) || 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, state.scope === "overview" ? 18 : 26);
  }

  function buildGraphData() {
    const resources = resourceSubset();
    const nodes = [];
    const links = [];
    const addNode = node => nodes.push({ ...node, color: COLORS[node.type] || COLORS[node.kind] || "#ffffff" });
    const addLink = (source, target, relation) => links.push({ source, target, relation });

    addNode({
      id: "atlas:root",
      label: "A3S 科研套件",
      labelEn: "A3S Science Registry",
      type: "root",
      val: 32,
      description: "连接学科、科研能力、知识主题与可安装套件的统一索引。"
    });

    const groups = new Map();
    for (const discipline of state.taxonomy.disciplines) {
      if (!groups.has(discipline.group)) {
        const id = `group:${slug(discipline.group)}`;
        groups.set(discipline.group, id);
        addNode({
          id,
          label: discipline.groupZh,
          labelEn: discipline.group,
          type: "group",
          val: 18
        });
        addLink("atlas:root", id, "contains");
      }
      const id = `discipline:${discipline.id}`;
      addNode({
        id,
        label: discipline.nameZh,
        labelEn: discipline.name,
        code: discipline.code,
        type: "discipline",
        taxonomyId: discipline.id,
        val: 12
      });
      addLink(groups.get(discipline.group), id, "contains");
    }

    addNode({
      id: "axis:capabilities",
      label: "科研能力",
      labelEn: "Research Capabilities",
      type: "capabilityHub",
      val: 20
    });
    addLink("atlas:root", "axis:capabilities", "organizes");
    for (const capability of state.taxonomy.capabilities) {
      const id = `capability:${capability.id}`;
      addNode({
        id,
        label: capability.nameZh,
        labelEn: capability.name,
        type: "capability",
        taxonomyId: capability.id,
        val: 10
      });
      addLink("axis:capabilities", id, "contains");
    }

    const topics = topicFrequency(resources);
    const topicIds = new Map();
    addNode({
      id: "axis:knowledge",
      label: "科研知识",
      labelEn: "Research Knowledge",
      type: "knowledgeHub",
      val: 18
    });
    addLink("atlas:root", "axis:knowledge", "organizes");
    for (const [topic, count] of topics) {
      const id = `topic:${slug(topic)}`;
      topicIds.set(topic, id);
      const translated = TOPIC_LABELS[topic];
      addNode({
        id,
        label: translated || topic,
        labelEn: translated ? topic : "",
        type: "topic",
        val: Math.min(9, 4 + Math.log2(count + 1)),
        count
      });
      addLink("axis:knowledge", id, "contains");
    }

    const rankedResources = [...resources]
      .sort((left, right) =>
        Number(right.featured) - Number(left.featured) ||
        Number(left.origin !== "native") - Number(right.origin !== "native") ||
        left.name.localeCompare(right.name)
      )
      .slice(0, Math.max(0, MAX_NODES - nodes.length));

    for (const resource of rankedResources) {
      addNode({
        id: `resource:${resource.id}`,
        label: resource.name,
        labelEn: KIND_LABELS[resource.kind] || resource.kind,
        type: "resource",
        kind: resource.kind,
        val: resource.featured ? 8 : resource.origin === "native" ? 6 : 4,
        resource
      });
      for (const disciplineId of normalizeArray(resource.disciplines)) {
        addLink(`discipline:${disciplineId}`, `resource:${resource.id}`, "applies to");
      }
      for (const capabilityId of normalizeArray(resource.capabilities)) {
        addLink(`capability:${capabilityId}`, `resource:${resource.id}`, "enables");
      }
      let topicLinks = 0;
      for (const tag of normalizeArray(resource.tags)) {
        if (topicIds.has(tag) && topicLinks < 2) {
          addLink(topicIds.get(tag), `resource:${resource.id}`, "describes");
          topicLinks += 1;
        }
      }
    }

    const retainedIds = new Set(nodes.map(node => node.id));
    const retainedLinks = links
      .filter(link => retainedIds.has(link.source) && retainedIds.has(link.target))
      .slice(0, MAX_LINKS);

    for (const node of nodes) node.degree = 0;
    const nodeMap = new Map(nodes.map(node => [node.id, node]));
    const neighbors = new Map(nodes.map(node => [node.id, new Set()]));
    for (const link of retainedLinks) {
      const source = nodeMap.get(link.source);
      const target = nodeMap.get(link.target);
      if (!source || !target) continue;
      source.degree += 1;
      target.degree += 1;
      neighbors.get(source.id).add(target.id);
      neighbors.get(target.id).add(source.id);
    }

    state.nodesById = nodeMap;
    state.neighbors = neighbors;
    state.graphData = { nodes, links: retainedLinks };
    return state.graphData;
  }

  function slug(value) {
    const normalized = String(value)
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (normalized) return normalized;
    let hash = 0;
    for (const character of String(value)) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
    return `topic-${Math.abs(hash)}`;
  }

  function activeNodeId() {
    return state.hoveredId || state.selectedId;
  }

  function relatedToActive(id) {
    const active = activeNodeId();
    return !active || id === active || state.neighbors.get(active)?.has(id);
  }

  function nodeColor(node) {
    const query = state.search.trim().toLocaleLowerCase();
    const searchMiss = query && !`${node.label} ${node.labelEn || ""}`.toLocaleLowerCase().includes(query);
    if (!relatedToActive(node.id) || searchMiss) return "rgba(96, 105, 126, 0.18)";
    return node.color;
  }

  function linkColor(link) {
    const active = activeNodeId();
    if (!active) return "rgba(108, 163, 255, 0.18)";
    const connected = nodeId(link.source) === active || nodeId(link.target) === active;
    return connected ? "rgba(108, 163, 255, 0.86)" : "rgba(96, 105, 126, 0.04)";
  }

  function linkWidth(link) {
    const active = activeNodeId();
    return active && (nodeId(link.source) === active || nodeId(link.target) === active) ? 1.5 : 0.3;
  }

  function tooltipElement(node) {
    const wrapper = document.createElement("div");
    wrapper.className = "graph-tooltip";
    const title = document.createElement("strong");
    title.textContent = node.label;
    wrapper.append(title);
    if (node.labelEn) {
      const secondary = document.createElement("span");
      secondary.textContent = node.labelEn;
      wrapper.append(secondary);
    }
    return wrapper;
  }

  function installGraph() {
    state.webgl = supportsWebGL() && typeof window.ForceGraph3D === "function";
    if (!state.webgl) {
      elements.loading.hidden = true;
      elements.unavailable.hidden = false;
      setMode("list");
      return;
    }

    const data = buildGraphData();
    const rect = elements.stage.getBoundingClientRect();
    const graph = new window.ForceGraph3D(elements.canvas, { controlType: "orbit", rendererConfig: { antialias: true, alpha: true } })
      .width(Math.max(320, rect.width))
      .height(Math.max(460, rect.height))
      .backgroundColor("rgba(0,0,0,0)")
      .showNavInfo(false)
      .nodeId("id")
      .nodeVal(node => node.val)
      .nodeRelSize(4.2)
      .nodeResolution(10)
      .nodeOpacity(0.94)
      .nodeColor(nodeColor)
      .nodeLabel(tooltipElement)
      .linkColor(linkColor)
      .linkWidth(linkWidth)
      .linkOpacity(0.56)
      .linkDirectionalArrowLength(link => state.selectedId && nodeId(link.source) === state.selectedId ? 2.8 : 0)
      .linkDirectionalArrowRelPos(0.82)
      .linkDirectionalArrowColor(() => COLORS.root)
      .linkDirectionalParticles(link => {
        if (reducedMotion || !state.selectedId) return 0;
        return nodeId(link.source) === state.selectedId || nodeId(link.target) === state.selectedId ? 1 : 0;
      })
      .linkDirectionalParticleWidth(1.7)
      .linkDirectionalParticleSpeed(0.004)
      .linkDirectionalParticleColor(() => COLORS.root)
      .warmupTicks(28)
      .cooldownTicks(170)
      .cooldownTime(9000)
      .dagMode("radialout")
      .dagLevelDistance(72)
      .onDagError(() => window.setTimeout(() => state.graph?.dagMode(null), 0))
      .onNodeHover(node => {
        state.hoveredId = node?.id || null;
        elements.stage.style.cursor = node ? "pointer" : "grab";
        graph.refresh();
      })
      .onNodeClick(node => selectNode(node.id, true))
      .onBackgroundClick(() => selectNode(null))
      .onEngineStop(() => {
        if (!state.fitted) {
          state.fitted = true;
          graph.zoomToFit(reducedMotion ? 0 : 900, 58);
        }
      })
      .graphData(data);

    graph.d3Force("charge")?.strength(-155);
    graph.d3Force("link")?.distance(link => {
      if (nodeId(link.source) === "atlas:root") return 88;
      if (String(nodeId(link.target)).startsWith("resource:")) return 52;
      return 64;
    });
    graph.controls().enableDamping = true;
    graph.controls().dampingFactor = 0.08;
    state.graph = graph;
    elements.loading.hidden = true;
    renderLabels();
    startLabelLoop();
    observeSize();
    observeVisibility();
  }

  function rebuildGraph() {
    state.selectedId = null;
    state.hoveredId = null;
    state.fitted = false;
    const data = buildGraphData();
    renderList();
    renderInspector(null);
    if (!state.graph) return;
    state.graph.graphData(data);
    state.graph.d3ReheatSimulation();
    window.setTimeout(() => state.graph?.zoomToFit(reducedMotion ? 0 : 700, 58), 240);
    renderLabels();
  }

  function focusCamera(node) {
    if (!state.graph || !Number.isFinite(node.x)) return;
    const distance = node.type === "root" ? 160 : node.type === "resource" ? 54 : 78;
    const magnitude = Math.hypot(node.x || 0, node.y || 0, node.z || 0);
    const ratio = magnitude > 0 ? 1 + distance / magnitude : 1;
    const position = magnitude > 0
      ? { x: node.x * ratio, y: node.y * ratio, z: node.z * ratio }
      : { x: 0, y: 0, z: distance };
    state.graph.cameraPosition(position, node, reducedMotion ? 0 : 850);
  }

  function selectNode(id, moveCamera = false) {
    state.selectedId = id;
    const node = id ? state.nodesById.get(id) : null;
    state.graph?.refresh();
    renderInspector(node);
    renderLabels();
    if (node && moveCamera) focusCamera(node);
  }

  function taxonomyLabels(ids, entries) {
    const lookup = new Map(entries.map(entry => [entry.id, entry]));
    return normalizeArray(ids)
      .map(id => lookup.get(id))
      .filter(Boolean)
      .map(entry => `${entry.nameZh} / ${entry.name}`);
  }

  function renderInspector(node) {
    if (!node) {
      elements.inspector.innerHTML = `
        <div class="inspector-empty">
          <span class="inspector-index">节点详情</span>
          <div class="inspector-symbol" aria-hidden="true">⌁</div>
          <h3>选择任意节点</h3>
          <p>点击球体或使用搜索，即可查看学科、科研能力、关联节点、来源、安装命令与现代化路线图。</p>
        </div>`;
      return;
    }

    const resource = node.resource;
    const typeLabel = resource ? KIND_LABELS[resource.kind] : TYPE_LABELS[node.type] || node.type;
    const description = resource?.package?.summaryZh || node.description ||
      `A3S 科研知识图谱中的${typeLabel}节点。`;
    const labels = resource
      ? [
          ...taxonomyLabels(resource.disciplines, state.taxonomy.disciplines),
          ...taxonomyLabels(resource.capabilities, state.taxonomy.capabilities)
        ]
      : [];
    const neighborIds = [...(state.neighbors.get(node.id) || [])];
    const neighborNodes = neighborIds
      .map(id => state.nodesById.get(id))
      .filter(Boolean)
      .sort((left, right) => right.degree - left.degree)
      .slice(0, 8);
    const actions = resource ? `
      <div class="inspector-actions">
        <button class="button button-primary button-small" type="button" data-inspect-resource="${escapeHtml(resource.id)}">查看套件详情</button>
        <a class="button button-secondary button-small" href="${escapeHtml(resource.url)}" target="_blank" rel="noreferrer">原始项目 <span aria-hidden="true">↗</span></a>
        ${resource.roadmap ? `<a class="button button-secondary button-small" href="${escapeHtml(resource.roadmap.url)}" target="_blank" rel="noreferrer">研发路线图 <span aria-hidden="true">↗</span></a>` : ""}
      </div>` : "";
    const packageBlock = resource?.package ? `
      <div class="inspector-package">
        <span>${escapeHtml(resource.package.packageRoleZh)} · v${escapeHtml(resource.package.version)}</span>
        <div class="inspector-command">
          <code>${escapeHtml(resource.package.installCommand)}</code>
          <button type="button" data-copy-command="${escapeHtml(resource.package.installCommand)}">复制</button>
        </div>
      </div>` : "";

    elements.inspector.innerHTML = `
      <span class="inspector-kicker">关联节点 / ${String(node.degree).padStart(3, "0")}</span>
      <span class="inspector-type">${escapeHtml(typeLabel)}</span>
      <h3>${escapeHtml(node.label)}</h3>
      ${node.labelEn ? `<p class="inspector-en">${escapeHtml(node.labelEn)}</p>` : ""}
      <p>${escapeHtml(description)}</p>
      ${labels.length ? `<div class="inspector-list">${labels.slice(0, 7).map(label => `<span>${escapeHtml(label)}</span>`).join("")}</div>` : ""}
      ${packageBlock}
      ${actions}
      <div class="inspector-neighbors">
        <strong>关联节点 / ${neighborIds.length}</strong>
        ${neighborNodes.map(neighbor => `<button type="button" data-neighbor-id="${escapeHtml(neighbor.id)}">${escapeHtml(neighbor.label)}</button>`).join("")}
      </div>`;

    elements.inspector.querySelectorAll("[data-neighbor-id]").forEach(button => {
      button.addEventListener("click", () => selectNode(button.dataset.neighborId, true));
    });
    elements.inspector.querySelector("[data-inspect-resource]")?.addEventListener("click", event => {
      window.A3SApp?.openResource(event.currentTarget.dataset.inspectResource);
    });
  }

  function labelCandidates() {
    return [...state.graphData.nodes]
      .sort((left, right) => {
        const selectedDifference = Number(right.id === state.selectedId) - Number(left.id === state.selectedId);
        if (selectedDifference) return selectedDifference;
        const typeRank = { root: 8, group: 7, discipline: 6, capabilityHub: 5, knowledgeHub: 5, capability: 4, topic: 3, resource: 1 };
        return (typeRank[right.type] || 0) - (typeRank[left.type] || 0) || right.degree - left.degree;
      })
      .slice(0, MAX_LABELS);
  }

  function renderLabels() {
    elements.labels.replaceChildren();
    for (const node of labelCandidates()) {
      const label = document.createElement("span");
      label.className = "graph-label";
      label.dataset.nodeId = node.id;
      label.dataset.type = node.type;
      label.dataset.selected = String(node.id === state.selectedId);
      label.textContent = node.label;
      elements.labels.append(label);
    }
    updateLabelPositions();
  }

  function updateLabelPositions() {
    if (!state.graph || typeof state.graph.graph2ScreenCoords !== "function") return;
    const width = elements.stage.clientWidth;
    const height = elements.stage.clientHeight;
    const occupied = [];
    elements.labels.querySelectorAll(".graph-label").forEach(label => {
      const node = state.nodesById.get(label.dataset.nodeId);
      if (!node || !Number.isFinite(node.x)) {
        label.hidden = true;
        return;
      }
      const point = state.graph.graph2ScreenCoords(node.x, node.y, node.z);
      const labelWidth = Math.min(180, Math.max(50, label.textContent.length * 5.5 + 14));
      const rectangle = {
        left: point.x + 8,
        right: point.x + 8 + labelWidth,
        top: point.y - 8,
        bottom: point.y + 8
      };
      const onScreen = rectangle.right > 0 && rectangle.left < width && rectangle.bottom > 0 && rectangle.top < height;
      const overlaps = occupied.some(existing =>
        rectangle.left < existing.right &&
        rectangle.right > existing.left &&
        rectangle.top < existing.bottom &&
        rectangle.bottom > existing.top
      );
      const selected = label.dataset.selected === "true";
      label.hidden = !onScreen || (overlaps && !selected);
      label.style.left = `${point.x}px`;
      label.style.top = `${point.y}px`;
      if (!label.hidden) occupied.push(rectangle);
    });
  }

  function startLabelLoop() {
    if (state.labelFrame) cancelAnimationFrame(state.labelFrame);
    const tick = () => {
      if (state.mode === "3d" && state.webgl) updateLabelPositions();
      state.labelFrame = requestAnimationFrame(tick);
    };
    state.labelFrame = requestAnimationFrame(tick);
  }

  function renderList() {
    const query = state.search.trim().toLocaleLowerCase();
    const nodes = state.graphData.nodes
      .filter(node => !query || `${node.label} ${node.labelEn || ""}`.toLocaleLowerCase().includes(query))
      .sort((left, right) => {
        const typeRank = { root: 8, group: 7, discipline: 6, capabilityHub: 5, knowledgeHub: 5, capability: 4, topic: 3, resource: 1 };
        return (typeRank[right.type] || 0) - (typeRank[left.type] || 0) || right.degree - left.degree || left.label.localeCompare(right.label);
      });
    elements.listCount.textContent = `${nodes.length.toLocaleString("zh-CN")} 个节点`;
    elements.list.replaceChildren();
    for (const node of nodes.slice(0, 220)) {
      const button = document.createElement("button");
      button.type = "button";
      const title = document.createElement("span");
      title.textContent = node.label;
      const meta = document.createElement("small");
      meta.textContent = node.resource ? KIND_LABELS[node.resource.kind] : TYPE_LABELS[node.type] || node.type;
      button.append(title, meta);
      button.addEventListener("click", () => {
        selectNode(node.id);
        if (state.webgl) {
          setMode("3d");
          window.setTimeout(() => focusCamera(node), 80);
        }
      });
      elements.list.append(button);
    }
  }

  function setMode(mode) {
    state.mode = mode;
    const listMode = mode === "list";
    elements.stage.hidden = listMode;
    elements.listPanel.hidden = !listMode;
    document.querySelectorAll("[data-graph-mode]").forEach(button => {
      const active = button.dataset.graphMode === mode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    if (listMode) {
      renderList();
      state.graph?.pauseAnimation();
    } else if (state.webgl) {
      state.graph?.resumeAnimation();
      window.setTimeout(() => state.graph?.zoomToFit(reducedMotion ? 0 : 500, 58), 50);
    }
  }

  function zoom(factor) {
    if (!state.graph) return;
    const position = state.graph.cameraPosition();
    state.graph.cameraPosition(
      { x: position.x * factor, y: position.y * factor, z: position.z * factor },
      undefined,
      reducedMotion ? 0 : 220
    );
  }

  function observeSize() {
    if (!window.ResizeObserver) return;
    new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (!rect || !state.graph) return;
      state.graph.width(Math.max(320, rect.width)).height(Math.max(460, rect.height));
    }).observe(elements.stage);
  }

  function observeVisibility() {
    if (!window.IntersectionObserver || !state.graph) return;
    new IntersectionObserver(entries => {
      if (state.mode !== "3d") return;
      if (entries[0]?.isIntersecting) state.graph.resumeAnimation();
      else state.graph.pauseAnimation();
    }, { rootMargin: "120px" }).observe(elements.stage);
  }

  function bindControls() {
    elements.scope.addEventListener("change", () => {
      state.scope = elements.scope.value;
      rebuildGraph();
    });
    elements.search.addEventListener("input", () => {
      state.search = elements.search.value;
      state.graph?.refresh();
      if (state.mode === "list") renderList();
    });
    elements.search.addEventListener("keydown", event => {
      if (event.key !== "Enter") return;
      const query = state.search.trim().toLocaleLowerCase();
      const match = state.graphData.nodes.find(node =>
        `${node.label} ${node.labelEn || ""}`.toLocaleLowerCase().includes(query)
      );
      if (match) {
        setMode("3d");
        selectNode(match.id, true);
      }
    });
    document.querySelectorAll("[data-graph-mode]").forEach(button => {
      button.addEventListener("click", () => setMode(button.dataset.graphMode));
    });
    document.querySelectorAll("[data-show-graph-list]").forEach(button => {
      button.addEventListener("click", () => setMode("list"));
    });
    document.querySelectorAll("[data-graph-action]").forEach(button => {
      button.addEventListener("click", () => {
        const action = button.dataset.graphAction;
        if (action === "zoom-in") zoom(0.74);
        if (action === "zoom-out") zoom(1.35);
        if (action === "fit") state.graph?.zoomToFit(reducedMotion ? 0 : 650, 58);
        if (action === "reset") {
          selectNode(null);
          state.search = "";
          elements.search.value = "";
          state.graph?.zoomToFit(reducedMotion ? 0 : 650, 58);
        }
      });
    });
    document.addEventListener("keydown", event => {
      const tag = document.activeElement?.tagName;
      if (event.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(tag)) {
        event.preventDefault();
        elements.search.focus();
      }
    });
  }

  function init({ taxonomy, resources }) {
    state.taxonomy = taxonomy;
    state.resources = resources;
    elements.canvas = document.getElementById("graph-canvas");
    elements.labels = document.getElementById("graph-labels");
    elements.stage = document.getElementById("graph-stage");
    elements.loading = document.getElementById("graph-loading");
    elements.unavailable = document.getElementById("graph-unavailable");
    elements.inspector = document.getElementById("graph-inspector");
    elements.listPanel = document.getElementById("graph-list-panel");
    elements.list = document.getElementById("graph-list");
    elements.listCount = document.getElementById("graph-list-count");
    elements.scope = document.getElementById("graph-scope");
    elements.search = document.getElementById("graph-search");
    bindControls();
    installGraph();
    renderList();
  }

  window.A3SGraph = {
    init,
    focusResource(resourceId) {
      const graphId = `resource:${resourceId}`;
      if (state.nodesById.has(graphId)) {
        setMode("3d");
        selectNode(graphId, true);
        document.getElementById("atlas")?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth" });
        return true;
      }
      elements.scope.value = "all";
      state.scope = "all";
      rebuildGraph();
      window.setTimeout(() => {
        const node = state.nodesById.get(graphId);
        if (node) {
          setMode("3d");
          selectNode(graphId, true);
        }
      }, 80);
      document.getElementById("atlas")?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth" });
      return true;
    }
  };
})();
