# A3S Science Package Registry

The A3S Science Registry gives every catalog resource one stable, managed
lifecycle entry point. It is the scientific-suite equivalent of an npm
registry, while preserving the existing A3S component and trust contracts.

## Identity contract

Each catalog resource has three related identifiers:

| Surface | Pattern | Example |
| --- | --- | --- |
| Catalog display name | `@a3s-science/<resource-id>` | `@a3s-science/native-autodock` |
| Extension package ID | `a3s/<resource-id>` | `a3s/native-autodock` |
| Umbrella component ID | `use/a3s/<resource-id>` | `use/a3s/native-autodock` |

The display name makes the marketplace familiar to package-registry users. The
actual CLI identity follows the existing A3S delegation model: the umbrella
CLI delegates `use/a3s/<resource-id>` to the external Use package
`a3s/<resource-id>`.

Every record has deterministic install, upgrade, and uninstall commands:

```text
a3s install use/a3s/<resource-id>
a3s upgrade use/a3s/<resource-id>
a3s uninstall use/a3s/<resource-id>
```

## Enroll and use the registry

The registry is published with the GitHub Pages site. Enroll it by pinning the
public TUF bootstrap root, refresh the signed metadata, and install a package:

```sh
a3s registry add https://a3s-lab.github.io/Science/registry/ \
  --trust-root sha256:a638ca1dd55909b3660134707804363637cc387e6272193e5227f36b89ae1b03 \
  --yes
a3s registry refresh a3s-lab
a3s install use/a3s/native-autodock
```

The registry name `a3s-lab` is derived by the CLI from the Pages host. Package
installs use the stable channel and portable `any` target.

## Package roles

The registry does not pretend that every upstream resource has the same
delivery boundary:

| Role | Installed content |
| --- | --- |
| Native workflow | The A3S-native `SKILL.md` plus its lightweight adjacent scripts, references, and workflow assets |
| MCP entry | A managed knowledge card, interface contract, and canonical service-runtime entry point |
| Ecosystem adapter | A curated upstream knowledge card, integration contract, and canonical source link |
| Catalog reference | Directory metadata, classification, and a canonical source link; no upstream software binary |

Native assets larger than 16 MiB are not duplicated into registry archives.
The canonical source remains the download location for large datasets, model
weights, and fixtures. Ecosystem and commercial source content is not copied or
relicensed.

## Published layout

```text
site/
├── data/
│   └── packages.jsonl
└── registry/
    ├── index.json
    ├── metadata/
    │   ├── root.json
    │   ├── timestamp.json
    │   ├── snapshot.json
    │   └── targets.json
    └── targets/
        └── extensions/a3s/<resource-id>/<version>/stable/any/*.tar.gz
```

TUF metadata signs every archive path, length, SHA-256, package ID, semantic
version, channel, and target. The A3S Use installer then repeats metadata
verification, downloads the exact target, validates the ACL manifest, rejects
unsafe archive entries, and activates the Skill package under managed roots.

## Regenerate and verify

Run these commands from the Science repository:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/generate-package-index.ps1

cargo run --manifest-path tools/registry-builder/Cargo.toml `
  --bin a3s-science-registry-builder -- `
  --catalog site/data/packages.jsonl `
  --output site/registry `
  --key-file .registry-signing-key `
  --metadata-version 2 `
  --expires 2030-01-01T00:00:00Z

powershell -ExecutionPolicy Bypass -File scripts/serve-site.ps1

cargo run --manifest-path tools/registry-builder/Cargo.toml `
  --bin verify-registry -- `
  http://127.0.0.1:4173/registry/ `
  site/registry/index.json
```

The verifier uses the released `a3s-use-extension` implementation to refresh
all TUF roles and install `a3s/native-autodock` into temporary managed roots.
This tests metadata signatures, target integrity, archive safety, ACL parsing,
native Skill content, and activation.

## Signing-key operations

`.registry-signing-key` is deliberately ignored by Git. It is offline signing
material and must never be committed, copied into Pages, printed in logs, or
stored with public artifacts. Back it up in a controlled secret store.

Increment metadata versions for every published registry change. Root rotation,
role separation, shorter online-role expiration, and automated secret-backed
publishing should be completed before treating this bootstrap registry as a
high-assurance production distribution service.
