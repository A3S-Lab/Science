# Catalog Methodology

## Scope

A3S Science catalogs resources that materially support research:

- scientific software and computational methods;
- research Skills and agent workflows;
- MCP servers for scientific databases, models, instruments, and compute;
- research agents and integrated workbenches;
- literature, scholarly communication, validation, and reproducibility tools.

Generic office utilities, system administration products, consumer multimedia
tools, unrelated network utilities, and general-purpose drafting or conversion
software are outside the catalog unless they implement a clear research
workflow.

## Normalized record

All sources use one JSONL schema. Discipline and capability values are arrays of
stable IDs from `site/data/taxonomy.json`; bilingual labels are never duplicated
inside resource records. This makes the taxonomy the single source of truth for
the site, graph, filters, and roadmap generator.

Descriptions are concise and research-oriented. Every record retains a
canonical HTTPS URL, source name, and source identifier.

## A3S native inventory

The native inventory is derived from checked-in Skills and MCP servers:

- 35 Skills across `autodock`, `amber-md`, `storm-research`, and
  `claude-science/skills`;
- 25 MCP resource cards, including the Bio Tools suite, Ketcher, and 23
  scientific data domains;
- approximately 247 Bio Tools operations represented at the domain level to
  keep the atlas navigable.

## Awesome AI for Science

The curated ecosystem snapshot is based on
[`ai4s-research/awesome-ai-for-science`](https://github.com/ai4s-research/awesome-ai-for-science)
commit `762864c467c0da22d43a7ed8d6c6640a57d00e4b`, retrieved 2026-07-27.

The selected 72 entries emphasize scientific software, Skills, MCP servers,
agents, workbenches, document and literature tooling, scientific machine
learning, and domain applications. Descriptions are paraphrased and link to the
upstream project. The upstream page is not mirrored.

## ScienceSoftware collection

The synchronization script uses the public directory list endpoint exposed by
the ScienceSoftware website. It identifies itself as:

```text
A3S-Science-Catalog/1.0 (+https://github.com/A3S-Lab/Science)
```

Requests are sequential and delayed by 150 milliseconds by default. Only the
list metadata required for a directory is stored:

- source ID;
- software name;
- short source descriptor;
- source category;
- canonical detail URL;
- retrieval date.

Long detail text, images, media, downloads, and installers are not fetched or
mirrored.

### Relevance results

| Source category | Available | Included | Excluded |
| --- | ---: | ---: | ---: |
| 经济管理 | 136 | 122 | 14 |
| 电力仿真 | 34 | 34 | 0 |
| 地球地理 | 32 | 32 | 0 |
| 生物化学 | 79 | 79 | 0 |
| 工程科学 | 65 | 51 | 14 |
| 排版工具 | 74 | 16 | 58 |
| 网络管理 | 49 | 6 | 43 |
| **Total** | **469** | **340** | **129** |

Research-dedicated categories are included with narrow exclusions for clearly
unrelated products. Mixed utility categories use explicit allowlists. The
reviewable policy and IDs live in
[`config/sciencesoftware-filter.json`](../config/sciencesoftware-filter.json).

Selected records are directory references, not endorsements. A short source
descriptor may not fully describe present-day functionality; users should
verify current capabilities, availability, licensing, and platform support
with the maintainer.

## Updating

1. Review and update the filter policy.
2. Run `scripts/sync-sciencesoftware.ps1`.
3. Review diffs, category counts, additions, and removals.
4. Update `catalog-manifest.json` when the upstream snapshot changes.
5. Regenerate modernization roadmaps.
6. Run `scripts/validate-site-data.ps1`.
7. Inspect both the 3D and list views before publication.
