# Research Software Modernization Program

## Purpose

The ScienceSoftware directory contains valuable research intents, but a catalog
name and short descriptor are not a modern product specification. A3S therefore
provides one independent successor roadmap for each of the 340 retained
research-relevant entries.

The plans are:

- clean-room proposals, not reverse-engineering instructions;
- independent of the original vendor or maintainer;
- not claims that the cataloged product is old, unavailable, or
  single-platform today;
- starting points that must change when user research and validation evidence
  demand it.

## Shared product contract

Every proposed successor targets:

- a responsive web application and installable PWA;
- signed Tauri desktop packages for Windows, macOS, and Linux;
- consistent PowerShell, Bash, notebook, and CI automation;
- optional OCI container, Slurm, or Kubernetes execution where scale requires
  it;
- English and Simplified Chinese interfaces;
- WCAG 2.2 AA accessibility and reduced-motion support;
- typed SDK, CLI, A3S Skill, and MCP contracts over the same validated core;
- portable projects containing inputs, parameters, versions, seeds,
  provenance, and checksums.

## Tailored architecture profiles

The generator chooses the most specific matching profile from 16 research
archetypes:

1. Scientific Visualization Platform
2. Social and Behavioral Research Platform
3. Statistical Analysis Platform
4. Mathematical Modeling and Optimization Platform
5. Power and Energy Systems Simulation Platform
6. Earth and Environmental Modeling Platform
7. Bioinformatics and Genomics Platform
8. Computational Chemistry and Materials Platform
9. Biomedical and Clinical Research Platform
10. Ecology and Agricultural Research Platform
11. Life Science Analysis Platform
12. Systems and Transport Simulation Platform
13. Engineering Simulation Platform
14. Scholarly Communication Platform
15. Scientific Software Development Platform
16. General Research Software Platform

Profiles define domain-specific core capabilities, open standards,
architecture, scientific validation, complexity, and milestone horizons.
Resource names, descriptors, classifications, sources, and first issues make
each roadmap item-specific.

## Delivery phases

- **Phase 0 — Evidence:** workflow interviews, license-safe fixtures, expected
  results, project schema, threat model, and non-goals.
- **Phase 1 — Reproducible vertical slice:** one validated end-to-end workflow
  with web, desktop, CLI, provenance, Skill, and MCP parity.
- **Phase 2 — Public beta:** full core scope, batch work, checkpoints,
  cross-platform packages, and blinded comparison studies.
- **Phase 3 — Stable 1.0:** frozen contracts, migrations, audits, reference
  datasets, method notes, checksums, and durable archives.

## Regeneration

Profile definitions live in
[`config/modernization-profiles.json`](../config/modernization-profiles.json).
After catalog or profile changes:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/generate-modernization-roadmaps.ps1
powershell -ExecutionPolicy Bypass -File scripts/validate-site-data.ps1
```

The generator writes all `roadmaps/<resource-id>/ROADMAP.md` files,
`roadmaps/README.md`, and the site's `roadmaps.jsonl` mapping.
