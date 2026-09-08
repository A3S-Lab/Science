# A3S Science

<p align="center">
  <strong>Language / 语言:</strong>
  <a href="README.md">English</a> ·
  <a href="README.zh-CN.md">中文</a>
</p>

Scientific Skills, MCP servers, research software, agents, and knowledge tooling
for A3S.

[Explore the live Science Atlas](https://a3s-lab.github.io/Science/) ·
[Browse the catalog data](site/data/) ·
[Use the Science package registry](docs/package-registry.md)

## Science Atlas

The static site under [`site/`](site/) turns the repository into an explorable
research map. Its interactive 3D graph connects:

- OECD FORD-aligned disciplines and subdisciplines with centrally maintained
  English and Chinese names;
- research capabilities such as literature discovery, scientific computing,
  modeling and simulation, visualization, reproducibility, and agentic
  workflows;
- native and curated software, Skills, MCP servers, agents, and workbenches;
- knowledge topics derived from resource metadata.

All 472 catalog entries have permanent detail pages with their description,
bilingual classification, source, related resources, and A3S lifecycle
commands.

The graph uses the interaction and performance principles of the A3S design
system: a cohesive bounded subgraph, searchable nodes, selected-neighbor
highlighting, camera focus, a rendering cap, reduced-motion support, and an
always-available accessible list.

The Chinese application shell follows the shared A3S interface system, with the
same sidebar proportions, panel hierarchy, control sizing, typography, color
tokens, responsive drawer behavior, and light/dark themes.

## Package registry

Every one of the 472 catalog resources has an npm-style display name and an A3S
managed component ID. For example:

```sh
a3s install use/a3s/native-autodock
a3s upgrade use/a3s/native-autodock
a3s uninstall use/a3s/native-autodock
```

The GitHub Pages deployment also hosts a TUF-signed registry. It can be enrolled
with the public bootstrap-root digest shown on the website. Native Skill
packages include their lightweight scripts and references. MCP and ecosystem
packages install managed entry contracts; ScienceSoftware packages retain
directory metadata, classification, and the canonical source link, never an
upstream software binary. See the
[package registry contract](docs/package-registry.md).

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

## Data layout

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

The GitHub Pages workflow runs the same validator before publishing `site/`.

## Attribution and licenses

Catalog records retain their source and canonical URL. Inclusion does not
endorse a resource or relicense its code or content. Native subprojects retain
their own licenses. The vendored `3d-force-graph` browser distribution is MIT
licensed; its notice and checksum are under [`site/vendor/`](site/vendor/).
