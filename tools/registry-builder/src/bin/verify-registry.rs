use std::path::PathBuf;

use a3s_use_extension::{
    refresh_remote_registry, ExtensionPaths, ExtensionRegistry, TrustedRegistry,
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

    let metadata = refresh_remote_registry(&trusted)
        .await
        .map_err(anyhow::Error::new)?;
    if metadata.package_targets != index.package_count {
        bail!(
            "verified {} signed targets, expected {}",
            metadata.package_targets,
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
        "Verified {} TUF targets and installed {}@{} with a Skill surface.",
        metadata.package_targets,
        installed.extension.manifest.package_id,
        installed.extension.manifest.version
    );
    Ok(())
}
