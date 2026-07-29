use std::collections::BTreeSet;
use std::path::PathBuf;

use a3s_use_core::{PluginReleaseChannel, PluginSurfaceKind, PLUGIN_CATALOG_SCHEMA};
use a3s_use_extension::{
    search_cached_plugins, search_remote_plugins, ExtensionPaths, ExtensionRegistry,
    PluginCatalogAvailability, PluginCatalogHost, PluginCatalogSearch, TrustedRegistry,
};
use anyhow::{bail, Context, Result};
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RegistryIndex {
    package_count: u64,
    root_sha256: String,
}

#[tokio::main]
async fn main() -> Result<()> {
    let mut arguments = std::env::args().skip(1);
    let registry_url = arguments
        .next()
        .unwrap_or_else(|| "http://127.0.0.1:4173/registry/".to_string());
    let index_path = arguments
        .next()
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("site/registry/index.json"));
    if arguments.next().is_some() {
        bail!("usage: verify-registry [REGISTRY_URL] [INDEX_PATH]");
    }

    let index: RegistryIndex = serde_json::from_slice(
        &std::fs::read(&index_path)
            .with_context(|| format!("could not read {}", index_path.display()))?,
    )?;
    let temporary = tempfile::tempdir()?;
    let trusted = TrustedRegistry::new(
        "science-local",
        &registry_url,
        &index.root_sha256,
        None,
        temporary.path().join("tuf"),
    )
    .map_err(anyhow::Error::new)?;

    let host = PluginCatalogHost::current().map_err(anyhow::Error::new)?;
    let mut search = PluginCatalogSearch {
        query: "science".to_owned(),
        kind: Some(PluginSurfaceKind::Skill),
        channel: Some(PluginReleaseChannel::Stable),
        publisher: Some("a3s".to_owned()),
        category: Some("science".to_owned()),
        availability: Some(PluginCatalogAvailability::Available),
        cursor: None,
        limit: 50,
    };
    let mut page = search_remote_plugins(&trusted, &host, &search)
        .await
        .map_err(anyhow::Error::new)?;
    if page.snapshot.metadata.package_targets != index.package_count
        || page.snapshot.catalog_records != index.package_count
        || page.total_matches != index.package_count
    {
        bail!(
            "verified {} signed targets, {} catalog records, and {} matches; expected {}",
            page.snapshot.metadata.package_targets,
            page.snapshot.catalog_records,
            page.total_matches,
            index.package_count
        );
    }
    let snapshot_digest = page.snapshot.snapshot_digest.clone();
    let mut discovered = BTreeSet::new();
    loop {
        for plugin in &page.plugins {
            if plugin.record.schema != PLUGIN_CATALOG_SCHEMA
                || plugin.record.surfaces.len() != 1
                || plugin.record.surfaces[0].kind != PluginSurfaceKind::Skill
                || plugin.record.archive.length == 0
                || !discovered.insert(plugin.record.package_id.clone())
            {
                bail!(
                    "catalog record '{}' is incomplete or duplicated",
                    plugin.record.package_id
                );
            }
        }
        let Some(cursor) = page.next_cursor else {
            break;
        };
        search.cursor = Some(cursor);
        page = search_cached_plugins(&trusted, &host, &search)
            .await
            .map_err(anyhow::Error::new)?;
        if page.snapshot.snapshot_digest != snapshot_digest
            || page.total_matches != index.package_count
        {
            bail!("offline catalog pagination changed the verified snapshot");
        }
    }
    if discovered.len() as u64 != index.package_count {
        bail!(
            "discovered {} unique catalog records, expected {}",
            discovered.len(),
            index.package_count
        );
    }

    let registry = ExtensionRegistry::new(ExtensionPaths::new(
        temporary.path().join("data"),
        temporary.path().join("state"),
    ));
    let installed = registry
        .install_remote(
            "a3s/native-autodock",
            &trusted,
            Some("1.0.0"),
            "stable",
            None,
            false,
        )
        .await
        .map_err(anyhow::Error::new)?;
    let skill_path = installed
        .extension
        .skill_path()
        .context("installed package has no Skill surface")?;
    let skill = std::fs::read_to_string(&skill_path)
        .with_context(|| format!("could not read installed Skill {}", skill_path.display()))?;
    if !skill.contains("name: autodock")
        || !skill_path
            .parent()
            .is_some_and(|path| path.join("scripts/autovina.py").is_file())
    {
        bail!("installed native Skill is missing its workflow content or adjacent scripts");
    }

    println!(
        "Verified and discovered {} TUF catalog records, then installed {}@{} with a Skill surface.",
        discovered.len(),
        installed.extension.manifest.package_id,
        installed.extension.manifest.version
    );
    Ok(())
}
