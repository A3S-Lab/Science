# A3S Science

<p align="center">
  <strong>语言 / Language:</strong>
  <a href="README.md">English</a> ·
  <a href="README.zh-CN.md">中文</a>
</p>

面向 A3S 的科学 Skills、MCP 服务器、研究软件、Agent 与知识工具。

[探索线上 Science Atlas](https://a3s-lab.github.io/Science/) ·
[浏览目录数据](site/data/) ·
[使用 Science 软件包 Registry](docs/package-registry.md)

## Science Atlas

[`site/`](site/) 下的静态站点把本仓库变成可探索的研究地图。其交互式 3D 图连接：

- 与 OECD FORD 对齐的学科与子学科，并集中维护中英文名称；
- 研究能力，例如文献发现、科学计算、建模与仿真、可视化、可复现性，以及智能体工作流；
- 原生与精选软件、Skills、MCP 服务器、Agent 与工作台；
- 从资源元数据派生的知识主题。

全部 472 条目录条目都有永久详情页，包含描述、双语分类、来源、相关资源，以及 A3S 生命周期命令。

该图遵循 A3S 设计系统的交互与性能原则：内聚的有界子图、可搜索节点、选中邻居高亮、相机聚焦、渲染上限、减弱动效支持，以及始终可用的无障碍列表。

中文应用壳遵循共享的 A3S 界面系统，具有相同的侧栏比例、面板层级、控件尺寸、排版、颜色 token、响应式抽屉行为，以及浅色/深色主题。

## 软件包 Registry

全部 472 条目录资源都有 npm 风格显示名与 A3S 托管组件 ID。例如：

```sh
a3s install use/a3s/native-autodock
a3s upgrade use/a3s/native-autodock
a3s uninstall use/a3s/native-autodock
```

GitHub Pages 部署还托管 TUF 签名的 Registry。可用网站上显示的公开 bootstrap-root 摘要进行登记。原生 Skill 包包含其轻量脚本与参考资料。MCP 与生态包安装托管入口契约；ScienceSoftware 包保留目录元数据、分类与规范来源链接，从不包含上游软件二进制。参见 [软件包 Registry 契约](docs/package-registry.md)。

## 目录快照

| 来源 | 收录 | 说明 |
| --- | ---: | --- |
| A3S Science | 60 | 35 个 Skills 与 25 个 MCP 资源，含 23 个 Bio Tools 领域 |
| Awesome AI for Science | 72 | 精选 Skills、MCP 服务器、工作台、Agent 与现代研究软件 |
| ScienceSoftware | 340 | 从 469 条可用记录中选出的研究相关条目 |
| **合计** | **472** | 统一的规范化资源模式 |

ScienceSoftware 集合仅存储简洁的目录元数据与规范链接。长描述、媒体与安装器不镜像。在审阅的 469 条记录中，排除了 129 条与研究无关的通用工具。明确策略与类别计数见 [目录方法论](docs/catalog-methodology.md)。

Awesome AI for Science 快照归属于提交 [`762864c`](https://github.com/ai4s-research/awesome-ai-for-science/commit/762864c467c0da22d43a7ed8d6c6640a57d00e4b)。

## 分类体系

研究领域与研究能力是两条独立轴：

```text
A3S Science
├── Fields / 学科领域
│   ├── Natural Sciences / 自然科学
│   │   ├── Mathematics / 数学
│   │   ├── Physical Sciences / 物理科学
│   │   └── Biological Sciences / 生物科学
│   ├── Engineering and Technology / 工程与技术
│   ├── Medical and Health Sciences / 医学与健康科学
│   ├── Agricultural and Veterinary Sciences / 农业与兽医学
│   ├── Social Sciences / 社会科学
│   └── Humanities and the Arts / 人文与艺术
└── Capabilities / 科研能力
    ├── Literature Discovery / 文献发现
    ├── Scientific Computing / 科学计算
    ├── Modeling and Simulation / 建模与仿真
    ├── Agentic Research Workflows / 智能科研工作流
    └── Reproducibility and Validation / 可复现性与验证
```

领域词汇遵循 Frascati Manual 中的 OECD Fields of Research and Development 分类。`Multidisciplinary Research / 多学科研究` 是明确标注的 A3S 扩展。完整规范表见 [分类文档](docs/taxonomy.md) 与 [`taxonomy.json`](site/data/taxonomy.json)。

## 原生研究工具

| 目录 | 用途 |
| --- | --- |
| [`claude-science/`](claude-science/) | 科学 Skills，以及 Bio Tools 与 Ketcher MCP 服务器 |
| [`autodock/`](autodock/) | 自动化 AutoDock Vina 准备、对接、排序与可视化 |
| [`amber-md/`](amber-md/) | Amber 分子动力学搭建、HPC 脚本与轨迹分析 |
| [`storm-research/`](storm-research/) | 多视角文献研究与证据综合 |

各目录的安装、运行时与许可证要求见对应目录。

## 数据布局

```text
site/
├── data/
│   ├── catalog-manifest.json # snapshot counts and source provenance
│   ├── taxonomy.json         # canonical bilingual field and capability names
│   ├── native.jsonl          # A3S-native Skills and MCP resources
│   ├── ecosystem.jsonl       # Awesome AI for Science selections
│   ├── sciencesoftware.jsonl # filtered ScienceSoftware directory metadata
│   └── packages.jsonl        # one A3S lifecycle contract per resource
├── resources/
│   └── <resource-id>/        # one permanent detail page per resource
├── registry/
│   ├── index.json            # registry identity and public enrollment command
│   ├── metadata/             # TUF root, timestamp, snapshot, and targets roles
│   └── targets/              # 472 portable extension archives
└── sitemap.xml               # homepage plus all resource detail URLs
```

每条资源具有相同的核心字段：

```json
{
  "id": "eco-deepchem",
  "name": "DeepChem",
  "kind": "Software",
  "disciplines": ["chemical-sciences", "biological-sciences"],
  "capabilities": ["scientific-machine-learning", "modeling-simulation"],
  "description": "Concise research-oriented description.",
  "url": "https://canonical.example/",
  "origin": "ecosystem",
  "status": "Curated",
  "featured": true,
  "tags": ["Molecular ML"],
  "language": "en",
  "source": "Awesome AI for Science",
  "sourceId": "DeepChem"
}
```

## 复现与校验

在本仓库中运行命令，而不是父 monorepo：

```powershell
# Refresh the filtered ScienceSoftware snapshot.
powershell -ExecutionPolicy Bypass -File scripts/sync-sciencesoftware.ps1

# Regenerate all package identities and lifecycle commands.
powershell -ExecutionPolicy Bypass -File scripts/generate-package-index.ps1

# Regenerate all permanent resource detail pages and the sitemap.
powershell -ExecutionPolicy Bypass -File scripts/generate-resource-pages.ps1

# Rebuild the signed registry with the offline local signing key.
cargo run --manifest-path tools/registry-builder/Cargo.toml `
  --bin a3s-science-registry-builder -- `
  --catalog site/data/packages.jsonl `
  --output site/registry `
  --key-file .registry-signing-key `
  --metadata-version 2 `
  --expires 2030-01-01T00:00:00Z

# Validate taxonomy IDs, source counts, URLs, filters, permanent pages,
# package coverage, registry artifacts, and the vendored graph dependency.
powershell -ExecutionPolicy Bypass -File scripts/validate-site-data.ps1

# Preview the static site.
powershell -ExecutionPolicy Bypass -File scripts/serve-site.ps1
```

GitHub Pages 工作流在发布 `site/` 前运行相同的校验器。

## 归属与许可证

目录记录保留其来源与规范 URL。收录并不构成对资源的背书，也不对其代码或内容重新授权。原生子项目保留各自许可证。内嵌的 `3d-force-graph` 浏览器发行版采用 MIT 许可；其声明与校验和位于 [`site/vendor/`](site/vendor/)。
