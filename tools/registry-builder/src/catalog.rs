use std::collections::BTreeSet;
use std::io::Cursor;

use a3s_use_core::{
    CatalogArchive, CatalogAvailability, CatalogPackage, CatalogSurface, PluginCatalogRecord,
    PluginPermissionCeiling, PluginReleaseChannel, PluginSurfaceKind, PLUGIN_CATALOG_SCHEMA,
    PLUGIN_PERMISSION_SCHEMA,
};
use anyhow::{bail, Context, Result};
use flate2::read::GzDecoder;
use sha2::{Digest, Sha256};

use super::PackageRecord;

const REQUIRES_USE: &str = ">=0.2.1, <0.4.0";
const CATALOG_LICENSE: &str = "LicenseRef-A3S-Science-Catalog";

pub(super) fn build_catalog_record(
    package: &PackageRecord,
    target_name: &str,
    archive: &[u8],
) -> Result<PluginCatalogRecord> {
    let permission_ceiling = PluginPermissionCeiling {
        schema: PLUGIN_PERMISSION_SCHEMA.to_owned(),
        surfaces: Vec::new(),
    };
    let permission_ceiling_digest = permission_ceiling
        .descriptor_digest()
        .map_err(anyhow::Error::new)?;
    let (expanded_bytes, file_count) = package_stats(archive)?;
    let mut keywords = BTreeSet::from([
        "science".to_owned(),
        catalog_tag(&package.kind)?,
        catalog_tag(&package.origin)?,
        catalog_tag(&package.package_role)?,
    ]);
    keywords.remove("");
    let categories = BTreeSet::from(["science".to_owned(), catalog_tag(&package.kind)?]);
    let repository = format!(
        "https://a3s-lab.github.io/Science/resources/{}/",
        package.resource_id
    );
    let availability = match package.status.as_str() {
        "available" => CatalogAvailability::Available,
        "deprecated" => CatalogAvailability::Deprecated {
            message: "This Science catalog package is deprecated.".to_owned(),
            replacement: None,
        },
        "withdrawn" => CatalogAvailability::Withdrawn {
            reason: "This Science catalog package was withdrawn.".to_owned(),
            advisory_url: Some(repository.clone()),
        },
        status => bail!(
            "package '{}' has unsupported catalog availability '{status}'",
            package.resource_id
        ),
    };
    let display_name = bounded_text(&package.name, 128, "display name")?;
    let description = bounded_text(
        &format!(
            "A3S Science catalog package for {display_name}. Kind: {}; origin: {}.",
            package.kind, package.origin
        ),
        2048,
        "description",
    )?;
    let record = PluginCatalogRecord {
        schema: PLUGIN_CATALOG_SCHEMA.to_owned(),
        package_id: package.package_id.clone(),
        display_name,
        description,
        publisher: "a3s".to_owned(),
        keywords: keywords.into_iter().collect(),
        categories: categories.into_iter().collect(),
        version: package.version.clone(),
        channel: PluginReleaseChannel::Stable,
        requires_use: REQUIRES_USE.to_owned(),
        target: package.target.clone(),
        surfaces: vec![CatalogSurface {
            kind: PluginSurfaceKind::Skill,
            id: package.resource_id.clone(),
            optional: false,
            workload: None,
            mcp_transport: None,
            mcp_tool_count: None,
        }],
        permission_ceiling,
        permission_ceiling_digest,
        archive: CatalogArchive {
            target_name: target_name.to_owned(),
            length: archive.len() as u64,
            sha256: format!("sha256:{:x}", Sha256::digest(archive)),
        },
        package: CatalogPackage {
            expanded_bytes,
            file_count,
            sha256: None,
        },
        license: CATALOG_LICENSE.to_owned(),
        repository,
        availability,
    };
    record
        .validate()
        .map_err(anyhow::Error::new)
        .with_context(|| {
            format!(
                "package '{}' produced an invalid signed catalog record",
                package.resource_id
            )
        })?;
    Ok(record)
}

fn package_stats(archive: &[u8]) -> Result<(u64, u64)> {
    let decoder = GzDecoder::new(Cursor::new(archive));
    let mut archive = tar::Archive::new(decoder);
    let mut expanded_bytes = 0_u64;
    let mut file_count = 0_u64;
    for entry in archive
        .entries()
        .context("could not inspect package archive")?
    {
        let entry = entry.context("could not inspect package archive entry")?;
        if entry.header().entry_type().is_file() {
            expanded_bytes = expanded_bytes
                .checked_add(entry.header().size()?)
                .context("expanded package size overflowed")?;
            file_count = file_count
                .checked_add(1)
                .context("package file count overflowed")?;
        }
    }
    if expanded_bytes == 0 || file_count == 0 {
        bail!("package archive contains no regular files");
    }
    Ok((expanded_bytes, file_count))
}

fn catalog_tag(value: &str) -> Result<String> {
    let mut tag = String::with_capacity(value.len().min(64));
    let mut previous_hyphen = false;
    for character in value.trim().chars().flat_map(char::to_lowercase) {
        let character = if character.is_ascii_alphanumeric() || matches!(character, '.' | '_') {
            character
        } else {
            '-'
        };
        if character == '-' {
            if tag.is_empty() || previous_hyphen {
                continue;
            }
            previous_hyphen = true;
        } else {
            previous_hyphen = false;
        }
        if tag.len() + character.len_utf8() > 64 {
            break;
        }
        tag.push(character);
    }
    while tag.ends_with('-') {
        tag.pop();
    }
    if tag.is_empty() {
        bail!("catalog tag source '{value}' contains no portable characters");
    }
    Ok(tag)
}

fn bounded_text(value: &str, max_bytes: usize, label: &str) -> Result<String> {
    let value = value.trim();
    if value.is_empty() || value.chars().any(char::is_control) {
        bail!("catalog {label} is empty or contains control characters");
    }
    if value.len() <= max_bytes {
        return Ok(value.to_owned());
    }
    let mut end = max_bytes;
    while !value.is_char_boundary(end) {
        end -= 1;
    }
    let value = value[..end].trim_end();
    if value.is_empty() {
        bail!("catalog {label} cannot be bounded safely");
    }
    Ok(value.to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generated_catalog_binds_search_metadata_and_archive_evidence() {
        let package = PackageRecord {
            schema_version: 1,
            resource_id: "native-fixture".to_owned(),
            name: "Native Fixture".to_owned(),
            kind: "Skill".to_owned(),
            origin: "native".to_owned(),
            source_id: "fixture".to_owned(),
            package_name: "@a3s-science/native-fixture".to_owned(),
            package_id: "a3s/native-fixture".to_owned(),
            component_id: "use/a3s/native-fixture".to_owned(),
            version: "1.0.0".to_owned(),
            channel: "stable".to_owned(),
            target: "any".to_owned(),
            status: "available".to_owned(),
            package_role: "workflow".to_owned(),
            install_command: "a3s install use/a3s/native-fixture".to_owned(),
            upgrade_command: "a3s upgrade use/a3s/native-fixture".to_owned(),
            uninstall_command: "a3s uninstall use/a3s/native-fixture".to_owned(),
            source_url: "https://github.com/A3S-Lab/Science".to_owned(),
        };
        let archive = test_archive();
        let target_name =
            "extensions/a3s/native-fixture/1.0.0/stable/any/native-fixture-1.0.0-any.tar.gz";

        let record = build_catalog_record(&package, target_name, &archive).unwrap();

        assert_eq!(record.schema, PLUGIN_CATALOG_SCHEMA);
        assert_eq!(record.package_id, "a3s/native-fixture");
        assert_eq!(record.surfaces[0].kind, PluginSurfaceKind::Skill);
        assert_eq!(record.archive.target_name, target_name);
        assert_eq!(record.archive.length, archive.len() as u64);
        assert!(record.keywords.contains(&"science".to_owned()));
        assert!(record.package.expanded_bytes > 0);
        assert_eq!(record.package.file_count, 1);
        record.validate().unwrap();
    }

    fn test_archive() -> Vec<u8> {
        let encoder = flate2::GzBuilder::new()
            .mtime(0)
            .write(Vec::new(), flate2::Compression::default());
        let mut archive = tar::Builder::new(encoder);
        let body = b"fixture";
        let mut header = tar::Header::new_gnu();
        header.set_path("package/SKILL.md").unwrap();
        header.set_size(body.len() as u64);
        header.set_mode(0o644);
        header.set_cksum();
        archive.append(&header, body.as_slice()).unwrap();
        archive.into_inner().unwrap().finish().unwrap()
    }
}
