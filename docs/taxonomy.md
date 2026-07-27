# Bilingual Research Taxonomy

## Design

A3S uses two independent axes:

1. **Research fields** answer “which discipline does this serve?”
2. **Research capabilities** answer “which part of the research workflow does
   this enable?”

This avoids presenting software categories such as “MCP” or “visualization” as
academic disciplines. A resource may belong to multiple fields and provide
multiple capabilities.

The canonical machine-readable vocabulary is
[`site/data/taxonomy.json`](../site/data/taxonomy.json).

## Research fields

Names and codes follow the OECD Fields of Research and Development (FORD)
classification in the
[Frascati Manual 2015](https://www.oecd.org/en/publications/frascati-manual-2015_9789264239012-en.html).
The Chinese names use conventional research-sector translations. A3S exposes
broad fields and the second-level fields needed by the current catalog.

| Code | English | 中文 | Broad field |
| --- | --- | --- | --- |
| A3S | Multidisciplinary Research | 多学科研究 | A3S cross-disciplinary extension |
| 1.1 | Mathematics | 数学 | Natural Sciences / 自然科学 |
| 1.2 | Computer and Information Sciences | 计算机与信息科学 | Natural Sciences / 自然科学 |
| 1.3 | Physical Sciences | 物理科学 | Natural Sciences / 自然科学 |
| 1.4 | Chemical Sciences | 化学科学 | Natural Sciences / 自然科学 |
| 1.5 | Earth and Related Environmental Sciences | 地球及相关环境科学 | Natural Sciences / 自然科学 |
| 1.6 | Biological Sciences | 生物科学 | Natural Sciences / 自然科学 |
| 2 | Engineering and Technology | 工程与技术 | Engineering and Technology / 工程与技术 |
| 2.1 | Civil Engineering | 土木工程 | Engineering and Technology / 工程与技术 |
| 2.2 | Electrical, Electronic and Information Engineering | 电气、电子与信息工程 | Engineering and Technology / 工程与技术 |
| 2.3 | Mechanical Engineering | 机械工程 | Engineering and Technology / 工程与技术 |
| 2.4 | Chemical Engineering | 化学工程 | Engineering and Technology / 工程与技术 |
| 2.5 | Materials Engineering | 材料工程 | Engineering and Technology / 工程与技术 |
| 2.6 | Medical Engineering | 医学工程 | Engineering and Technology / 工程与技术 |
| 2.7 | Environmental Engineering | 环境工程 | Engineering and Technology / 工程与技术 |
| 3 | Medical and Health Sciences | 医学与健康科学 | Medical and Health Sciences / 医学与健康科学 |
| 4 | Agricultural and Veterinary Sciences | 农业与兽医学 | Agricultural and Veterinary Sciences / 农业与兽医学 |
| 5 | Social Sciences | 社会科学 | Social Sciences / 社会科学 |
| 5.1 | Psychology and Cognitive Sciences | 心理学与认知科学 | Social Sciences / 社会科学 |
| 5.2 | Economics and Business | 经济学与商学 | Social Sciences / 社会科学 |
| 6 | Humanities and the Arts | 人文与艺术 | Humanities and the Arts / 人文与艺术 |

`Multidisciplinary Research / 多学科研究` is an A3S extension for resources
without one dominant FORD field. It is intentionally not assigned an OECD code.

## Research capabilities

| English | 中文 |
| --- | --- |
| Literature Discovery | 文献发现 |
| Scholarly Communication | 学术传播 |
| Data Analysis and Statistics | 数据分析与统计 |
| Scientific Visualization | 科学可视化 |
| Scientific Computing | 科学计算 |
| Scientific Machine Learning | 科学机器学习 |
| Modeling and Simulation | 建模与仿真 |
| Data Access and Integration | 数据访问与集成 |
| Agentic Research Workflows | 智能科研工作流 |
| Research Infrastructure | 科研基础设施 |
| Research Operations | 科研流程管理 |
| Reproducibility and Validation | 可复现性与验证 |
| Laboratory Automation | 实验室自动化 |

## Maintenance rules

- Add or rename a label only in `taxonomy.json`.
- Use exact taxonomy IDs in every catalog record and configuration override.
- Prefer an established FORD name over a locally invented field label.
- Add a narrower field only when catalog coverage requires it.
- Keep workflow terms on the capability axis.
- Run `scripts/validate-site-data.ps1` after every change.
