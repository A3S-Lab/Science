# A3S Science

Scientific Skills, MCP servers, research software, agents, and knowledge tooling
for A3S.

[Explore the live Science Atlas](https://a3s-lab.github.io/Science/) ·
[Browse the catalog data](site/data/) ·
[Open modernization roadmaps](roadmaps/)

## Science Atlas

The static site under [`site/`](site/) turns the repository into an explorable
research map. Its interactive 3D graph connects:

- OECD FORD-aligned disciplines and subdisciplines with centrally maintained
  English and Chinese names;
- research capabilities such as literature discovery, scientific computing,
  modeling and simulation, visualization, reproducibility, and agentic
  workflows;
- native and curated software, Skills, MCP servers, agents, and workbenches;
- knowledge topics derived from resource metadata;
- an individual cross-platform modernization roadmap for every retained
  ScienceSoftware entry.

The graph uses the interaction and performance principles of the A3S Web memory
graph: a cohesive bounded subgraph, searchable nodes, selected-neighbor
highlighting, camera focus, a rendering cap, reduced-motion support, and an
always-available accessible list.

## Catalog snapshot

| Source | Included | Notes |
| --- | ---: | --- |
| A3S Science | 60 | 35 Skills and 25 MCP resources, including 23 Bio Tools domains |
| Awesome AI for Science | 72 | Curated Skills, MCP servers, workbenches, agents, and modern research software |
| ScienceSoftware | 340 | Research-relevant entries selected from 469 available records |
| **Total** | **472** | One normalized resource schema |

ScienceSoftware collection stores concise directory metadata and canonical
links only. Long descriptions, media, and installers are not mirrored. Of 469
records reviewed, 129 generic utilities unrelated to research were excluded.
See [catalog methodology](docs/catalog-methodology.md) for the explicit policy
and category counts.

The Awesome AI for Science snapshot is attributed to commit
[`762864c`](https://github.com/ai4s-research/awesome-ai-for-science/commit/762864c467c0da22d43a7ed8d6c6640a57d00e4b).

## Taxonomy

Research fields and research capabilities are separate axes:

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

The field vocabulary follows the OECD Fields of Research and Development
classification in the Frascati Manual. `Multidisciplinary Research / 多学科研究`
is the clearly marked A3S extension. The complete canonical table is in
[taxonomy documentation](docs/taxonomy.md) and
[`taxonomy.json`](site/data/taxonomy.json).

## Native research tooling

| Directory | Purpose |
| --- | --- |
| [`claude-science/`](claude-science/) | Scientific Skills plus Bio Tools and Ketcher MCP servers |
| [`autodock/`](autodock/) | Automated AutoDock Vina preparation, docking, ranking, and visualization |
| [`amber-md/`](amber-md/) | Amber molecular-dynamics setup, HPC scripts, and trajectory analysis |
| [`storm-research/`](storm-research/) | Multi-perspective literature research and evidence synthesis |

Refer to each directory for its installation, runtime, and license requirements.

## Modernization roadmaps

Every one of the 340 retained ScienceSoftware records has its own
`roadmaps/<resource-id>/ROADMAP.md`. Each plan is generated from a tailored
research architecture archetype and includes:

- the original research intent and bilingual classification;
- a browser/PWA, Windows, macOS, and Linux platform contract;
- headless CLI, notebook, container, HPC, Skill, and MCP interfaces;
- open formats, provenance, deterministic migration, and validation;
- evidence, MVP, beta, and stable 1.0 phases;
- verification, initial issues, risks, and clean-room non-goals.

These are independent product proposals, not claims about a vendor's current
platform support and not statements of affiliation. See the
[modernization program](docs/modernization-program.md).

## Data layout

```text
site/data/
├── catalog-manifest.json     # snapshot counts and source provenance
├── taxonomy.json             # canonical bilingual field and capability names
├── native.jsonl              # A3S-native Skills and MCP resources
├── ecosystem.jsonl           # Awesome AI for Science selections
├── sciencesoftware.jsonl     # filtered ScienceSoftware directory metadata
└── roadmaps.jsonl            # resource-to-roadmap mapping
```

Every resource has the same core fields:

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

## Reproduce and validate

Run commands from this repository, not the parent monorepo:

```powershell
# Refresh the filtered ScienceSoftware snapshot.
powershell -ExecutionPolicy Bypass -File scripts/sync-sciencesoftware.ps1

# Regenerate all per-resource modernization plans and their site mapping.
powershell -ExecutionPolicy Bypass -File scripts/generate-modernization-roadmaps.ps1

# Validate taxonomy IDs, source counts, arrays, URLs, filters, roadmaps, assets,
# file-size rules, and the vendored graph dependency checksum.
powershell -ExecutionPolicy Bypass -File scripts/validate-site-data.ps1

# Preview the static site.
powershell -ExecutionPolicy Bypass -File scripts/serve-site.ps1
```

The GitHub Pages workflow runs the same validator before publishing `site/`.

## Attribution and licenses

Catalog records retain their source and canonical URL. Inclusion does not
endorse a resource or relicense its code or content. Native subprojects retain
their own licenses. The vendored `3d-force-graph` browser distribution is MIT
licensed; its notice and checksum are under [`site/vendor/`](site/vendor/).
