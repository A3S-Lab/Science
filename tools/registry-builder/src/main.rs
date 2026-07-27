use std::collections::BTreeSet;
use std::fmt::Write as _;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

use anyhow::{bail, Context, Result};
use flate2::{Compression, GzBuilder};
use olpc_cjson::CanonicalFormatter;
use ring::rand::{SecureRandom, SystemRandom};
use ring::signature::{Ed25519KeyPair, KeyPair};
use semver::Version;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};

const REGISTRY_URL: &str = "https://a3s-lab.github.io/Science/registry/";
const REGISTRY_NAME: &str = "a3s-lab";
const DEFAULT_EXPIRES: &str = "2030-01-01T00:00:00Z";
const MAX_NATIVE_ASSET_BYTES: u64 = 16 * 1024 * 1024;

#[derive(Debug)]
struct Config {
    catalog: PathBuf,
    output: PathBuf,
    key_file: PathBuf,
    metadata_version: u64,
    expires: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PackageRecord {
    schema_version: u32,
    resource_id: String,
    name: String,
    kind: String,
    origin: String,
    source_id: String,
    package_name: String,
    package_id: String,
    component_id: String,
    version: String,
    channel: String,
    target: String,
    package_role: String,
    install_command: String,
    upgrade_command: String,
    uninstall_command: String,
    source_url: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RegistryIndex<'a> {
    schema_version: u32,
    name: &'a str,
    registry_url: &'a str,
    package_count: usize,
    root_sha256: String,
    root_version: u64,
    metadata_version: u64,
    expires: &'a str,
    enroll_command: String,
    refresh_command: String,
    install_pattern: &'a str,
}

fn main() -> Result<()> {
    let config = parse_args()?;
    let packages = read_catalog(&config.catalog)?;
    validate_catalog(&packages)?;
    prepare_output(&config.output)?;

    let seed = load_or_create_seed(&config.key_file)?;
    let key = Ed25519KeyPair::from_seed_unchecked(&seed)
        .map_err(|_| anyhow::anyhow!("the registry signing seed is invalid"))?;
    let key_value = json!({
        "keytype": "ed25519",
        "scheme": "ed25519",
        "keyval": {"public": hex_lower(key.public_key().as_ref())}
    });
    let key_id = sha256(&canonical(&key_value)?);
    let root = build_root(&key, &key_id, key_value, &config)?;
    let root_sha256 = sha256(&root);

    let targets = build_packages(&packages, &config.output)?;
    let targets = signed_document(
        &key,
        &key_id,
        json!({
            "_type": "targets",
            "spec_version": "1.0.0",
            "version": config.metadata_version,
            "expires": config.expires,
            "targets": targets
        }),
    )?;
    let snapshot = signed_document(
        &key,
        &key_id,
        json!({
            "_type": "snapshot",
            "spec_version": "1.0.0",
            "version": config.metadata_version,
            "expires": config.expires,
            "meta": {
                "targets.json": metadata_description(config.metadata_version, &targets)
            }
        }),
    )?;
    let timestamp = signed_document(
        &key,
        &key_id,
        json!({
            "_type": "timestamp",
            "spec_version": "1.0.0",
            "version": config.metadata_version,
            "expires": config.expires,
            "meta": {
                "snapshot.json": metadata_description(config.metadata_version, &snapshot)
            }
        }),
    )?;

    let metadata = config.output.join("metadata");
    write_bytes(&metadata.join("root.json"), &root)?;
    write_bytes(&metadata.join("targets.json"), &targets)?;
    write_bytes(&metadata.join("snapshot.json"), &snapshot)?;
    write_bytes(&metadata.join("timestamp.json"), &timestamp)?;

    let index = RegistryIndex {
        schema_version: 1,
        name: "A3S Science Registry",
        registry_url: REGISTRY_URL,
        package_count: packages.len(),
        root_sha256: format!("sha256:{root_sha256}"),
        root_version: 1,
        metadata_version: config.metadata_version,
        expires: &config.expires,
        enroll_command: format!(
            "a3s registry add {REGISTRY_URL} --trust-root sha256:{root_sha256} --yes"
        ),
        refresh_command: format!("a3s registry refresh {REGISTRY_NAME}"),
        install_pattern: "a3s install use/a3s/<resource-id>",
    };
    let index_bytes = serde_json::to_vec_pretty(&index)?;
    write_bytes(&config.output.join("index.json"), &index_bytes)?;

    println!(
        "Built {} signed A3S Science packages; trust root sha256:{}",
        packages.len(),
        root_sha256
    );
    Ok(())
}

fn parse_args() -> Result<Config> {
    let mut catalog = PathBuf::from("site/data/packages.jsonl");
    let mut output = PathBuf::from("site/registry");
    let mut key_file = PathBuf::from(".registry-signing-key");
    let mut metadata_version = 1_u64;
    let mut expires = DEFAULT_EXPIRES.to_string();
    let mut args = std::env::args().skip(1);

    while let Some(argument) = args.next() {
        let value = match argument.as_str() {
            "--catalog" | "--output" | "--key-file" | "--metadata-version" | "--expires" => args
                .next()
                .with_context(|| format!("{argument} requires a value"))?,
            "--help" | "-h" => {
                println!(
                    "Usage: registry-builder [--catalog PATH] [--output PATH] \
                     [--key-file PATH] [--metadata-version NUMBER] [--expires RFC3339]"
                );
                std::process::exit(0);
            }
            _ => bail!("unknown argument '{argument}'"),
        };
        match argument.as_str() {
            "--catalog" => catalog = PathBuf::from(value),
            "--output" => output = PathBuf::from(value),
            "--key-file" => key_file = PathBuf::from(value),
            "--metadata-version" => {
                metadata_version = value
                    .parse()
                    .context("--metadata-version must be a positive integer")?;
                if metadata_version == 0 {
                    bail!("--metadata-version must be greater than zero");
                }
            }
            "--expires" => expires = value,
            _ => unreachable!(),
        }
    }

    Ok(Config {
        catalog,
        output,
        key_file,
        metadata_version,
        expires,
    })
}

fn read_catalog(path: &Path) -> Result<Vec<PackageRecord>> {
    let source = fs::read_to_string(path)
        .with_context(|| format!("could not read package catalog {}", path.display()))?;
    source
        .lines()
        .enumerate()
        .filter(|(_, line)| !line.trim().is_empty())
        .map(|(index, line)| {
            serde_json::from_str(line).with_context(|| {
                format!(
                    "invalid package record at {} line {}",
                    path.display(),
                    index + 1
                )
            })
        })
        .collect()
}

fn validate_catalog(packages: &[PackageRecord]) -> Result<()> {
    if packages.is_empty() {
        bail!("the package catalog is empty");
    }
    let mut package_ids = BTreeSet::new();
    for package in packages {
        if package.schema_version != 1 {
            bail!(
                "package '{}' has unsupported schema version {}",
                package.resource_id,
                package.schema_version
            );
        }
        if !valid_segment(&package.resource_id)
            || package.package_id != format!("a3s/{}", package.resource_id)
            || package.component_id != format!("use/{}", package.package_id)
        {
            bail!(
                "package '{}' does not follow the A3S Science identity contract",
                package.resource_id
            );
        }
        if package.package_name != format!("@a3s-science/{}", package.resource_id) {
            bail!(
                "package '{}' has an invalid display name",
                package.resource_id
            );
        }
        Version::parse(&package.version)
            .with_context(|| format!("package '{}' has an invalid version", package.resource_id))?;
        if package.channel != "stable" || package.target != "any" {
            bail!(
                "package '{}' must use the stable channel and portable 'any' target",
                package.resource_id
            );
        }
        if package.install_command != format!("a3s install {}", package.component_id)
            || package.upgrade_command != format!("a3s upgrade {}", package.component_id)
            || package.uninstall_command != format!("a3s uninstall {}", package.component_id)
        {
            bail!(
                "package '{}' has lifecycle commands that do not match its component ID",
                package.resource_id
            );
        }
        if !package_ids.insert(package.package_id.clone()) {
            bail!("duplicate package ID '{}'", package.package_id);
        }
    }
    Ok(())
}

fn valid_segment(value: &str) -> bool {
    let mut characters = value.chars();
    matches!(characters.next(), Some(first) if first.is_ascii_lowercase())
        && characters.all(|character| {
            character.is_ascii_lowercase() || character.is_ascii_digit() || character == '-'
        })
}

fn prepare_output(path: &Path) -> Result<()> {
    let current = std::env::current_dir()?.canonicalize()?;
    let absolute = current.join(path);
    let expected = current.join("site").join("registry");
    if absolute != expected {
        bail!(
            "refusing to replace registry output outside '{}'",
            expected.display()
        );
    }
    for child in ["metadata", "targets"] {
        let child = absolute.join(child);
        if child.exists() {
            fs::remove_dir_all(&child)
                .with_context(|| format!("could not replace {}", child.display()))?;
        }
        fs::create_dir_all(&child)
            .with_context(|| format!("could not create {}", child.display()))?;
    }
    Ok(())
}

fn load_or_create_seed(path: &Path) -> Result<[u8; 32]> {
    if path.exists() {
        let bytes = fs::read(path)
            .with_context(|| format!("could not read signing seed {}", path.display()))?;
        return bytes
            .try_into()
            .map_err(|_| anyhow::anyhow!("the signing seed must contain exactly 32 bytes"));
    }

    let mut seed = [0_u8; 32];
    SystemRandom::new()
        .fill(&mut seed)
        .map_err(|_| anyhow::anyhow!("could not generate registry signing seed"))?;
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(path)
        .with_context(|| format!("could not create signing seed {}", path.display()))?;
    file.write_all(&seed)?;
    file.sync_all()?;
    Ok(seed)
}

fn build_root(
    key: &Ed25519KeyPair,
    key_id: &str,
    key_value: Value,
    config: &Config,
) -> Result<Vec<u8>> {
    let role = json!({"keyids": [key_id], "threshold": 1});
    let mut keys = Map::new();
    keys.insert(key_id.to_string(), key_value);
    signed_document(
        key,
        key_id,
        json!({
            "_type": "root",
            "spec_version": "1.0.0",
            "consistent_snapshot": false,
            "version": 1,
            "expires": config.expires,
            "keys": keys,
            "roles": {
                "root": role.clone(),
                "snapshot": role.clone(),
                "targets": role.clone(),
                "timestamp": role
            }
        }),
    )
}

fn build_packages(packages: &[PackageRecord], output: &Path) -> Result<Map<String, Value>> {
    let mut targets = Map::new();
    for package in packages {
        let archive = extension_archive(package)?;
        let archive_name = format!(
            "a3s-use-a3s-{}-{}-any.tar.gz",
            package.resource_id, package.version
        );
        let target_name = format!(
            "extensions/{}/{}/{}/{}/{}",
            package.package_id, package.version, package.channel, package.target, archive_name
        );
        write_bytes(&output.join("targets").join(&target_name), &archive)?;
        targets.insert(
            target_name,
            json!({
                "length": archive.len(),
                "hashes": {"sha256": sha256(&archive)},
                "custom": {
                    "a3s": {
                        "schemaVersion": 1,
                        "packageId": package.package_id,
                        "version": package.version,
                        "channel": package.channel,
                        "target": package.target
                    }
                }
            }),
        );
    }
    Ok(targets)
}

fn extension_archive(package: &PackageRecord) -> Result<Vec<u8>> {
    let manifest = format!(
        "extension \"{}\" {{\n  schema_version = 1\n  version = \"{}\"\n  \
         route = \"science-{}\"\n  actions = [\"read\"]\n\n  skill {{\n    path = \
         \"skills/{}/SKILL.md\"\n  }}\n}}\n",
        package.package_id, package.version, package.resource_id, package.resource_id
    );
    let skill = skill_document(package);
    let encoder = GzBuilder::new()
        .mtime(0)
        .write(Vec::new(), Compression::default());
    let mut archive = tar::Builder::new(encoder);
    archive.mode(tar::HeaderMode::Deterministic);
    append_tar_file(
        &mut archive,
        "package/a3s-use-extension.acl",
        manifest.as_bytes(),
    )?;
    append_tar_file(&mut archive, "package/PACKAGE.md", skill.as_bytes())?;
    if package.origin == "native" && package.kind == "Skill" {
        append_native_skill(&mut archive, package)?;
    } else {
        append_tar_file(
            &mut archive,
            &format!("package/skills/{}/SKILL.md", package.resource_id),
            skill.as_bytes(),
        )?;
    }
    let encoder = archive.into_inner()?;
    Ok(encoder.finish()?)
}

fn append_native_skill<W: Write>(
    archive: &mut tar::Builder<W>,
    package: &PackageRecord,
) -> Result<()> {
    let repository = std::env::current_dir()?.canonicalize()?;
    let source_root = repository
        .join(&package.source_id)
        .canonicalize()
        .with_context(|| {
            format!(
                "native package '{}' has no source directory '{}'",
                package.resource_id, package.source_id
            )
        })?;
    if !source_root.starts_with(&repository) || !source_root.is_dir() {
        bail!(
            "native package '{}' source must be a repository directory",
            package.resource_id
        );
    }

    let mut files = Vec::new();
    collect_native_files(&source_root, &source_root, &mut files)?;
    files.sort();
    let mut found_skill = false;
    for source in files {
        let relative = source.strip_prefix(&source_root)?;
        let root_skill = relative.components().count() == 1
            && relative
                .file_name()
                .and_then(|value| value.to_str())
                .is_some_and(|value| value.eq_ignore_ascii_case("skill.md"));
        if root_skill {
            found_skill = true;
        }
        let relative = if root_skill {
            "SKILL.md".to_string()
        } else {
            portable_path(relative)?
        };
        let target = format!("package/skills/{}/{}", package.resource_id, relative);
        let body = fs::read(&source)
            .with_context(|| format!("could not read native asset {}", source.display()))?;
        append_tar_file(archive, &target, &body)?;
    }
    if !found_skill {
        bail!(
            "native package '{}' source has no root SKILL.md",
            package.resource_id
        );
    }
    Ok(())
}

fn collect_native_files(root: &Path, directory: &Path, files: &mut Vec<PathBuf>) -> Result<()> {
    let mut entries = fs::read_dir(directory)
        .with_context(|| format!("could not read native source {}", directory.display()))?
        .collect::<std::io::Result<Vec<_>>>()?;
    entries.sort_by_key(|entry| entry.file_name());
    for entry in entries {
        let path = entry.path();
        let metadata = fs::symlink_metadata(&path)?;
        if metadata.file_type().is_symlink() {
            bail!(
                "native source asset '{}' must not be a symlink",
                path.display()
            );
        }
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if metadata.is_dir() {
            if matches!(
                name.as_ref(),
                ".git" | "__pycache__" | "node_modules" | "target"
            ) {
                continue;
            }
            collect_native_files(root, &path, files)?;
        } else if metadata.is_file()
            && metadata.len() <= MAX_NATIVE_ASSET_BYTES
            && name != ".DS_Store"
            && !name.ends_with(".pyc")
            && path.starts_with(root)
        {
            files.push(path);
        }
    }
    Ok(())
}

fn portable_path(path: &Path) -> Result<String> {
    path.components()
        .map(|component| {
            component
                .as_os_str()
                .to_str()
                .map(str::to_string)
                .context("native package contains a non-UTF-8 path")
        })
        .collect::<Result<Vec<_>>>()
        .map(|components| components.join("/"))
}

fn skill_document(package: &PackageRecord) -> String {
    let role = match package.package_role.as_str() {
        "workflow" => {
            "This package includes an A3S-native Skill with its adjacent scripts, references, and workflow assets."
        }
        "interface" => {
            "This package installs an MCP knowledge card and interface contract. Prepare the service runtime according to the canonical source requirements."
        }
        "reference" => {
            "This package installs catalog metadata, classification, and a canonical source link. It does not contain or license the original software binary."
        }
        _ => {
            "This package installs a curated upstream knowledge card and integration contract. Verify upstream requirements before execution."
        }
    };
    format!(
        "---\nname: a3s-science-{}\ndescription: Managed A3S Science catalog package for {}.\n---\n\n\
         # {}\n\n{}\n\n## Package contract\n\n- Kind: {}\n- Origin: {}\n- Source: {}\n\
         - Install: `{}`\n- Upgrade: `{}`\n- Uninstall: `{}`\n\n## Safe use\n\n\
         1. Review the canonical source, license, data policy, and platform requirements.\n\
         2. Treat this package as a reproducible A3S entry point, not as an endorsement of scientific conclusions.\n\
         3. Preserve inputs, parameters, environment details, provenance, and output checksums.\n\
         4. Validate results against domain references before publication or operational use.\n",
        package.resource_id,
        package.name,
        package.name,
        role,
        package.kind,
        package.origin,
        package.source_url,
        package.install_command,
        package.upgrade_command,
        package.uninstall_command
    )
}

fn append_tar_file<W: Write>(archive: &mut tar::Builder<W>, path: &str, body: &[u8]) -> Result<()> {
    let mut header = tar::Header::new_gnu();
    header.set_path(path)?;
    header.set_size(body.len() as u64);
    header.set_mode(0o644);
    header.set_mtime(0);
    header.set_uid(0);
    header.set_gid(0);
    header.set_cksum();
    archive.append(&header, body)?;
    Ok(())
}

fn signed_document(key: &Ed25519KeyPair, key_id: &str, signed: Value) -> Result<Vec<u8>> {
    let signature = key.sign(&canonical(&signed)?);
    Ok(serde_json::to_vec(&json!({
        "signatures": [{"keyid": key_id, "sig": hex_lower(signature.as_ref())}],
        "signed": signed
    }))?)
}

fn metadata_description(version: u64, bytes: &[u8]) -> Value {
    json!({
        "version": version,
        "length": bytes.len(),
        "hashes": {"sha256": sha256(bytes)}
    })
}

fn canonical(value: &Value) -> Result<Vec<u8>> {
    let mut bytes = Vec::new();
    let mut serializer =
        serde_json::Serializer::with_formatter(&mut bytes, CanonicalFormatter::new());
    value.serialize(&mut serializer)?;
    Ok(bytes)
}

fn sha256(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn hex_lower(bytes: &[u8]) -> String {
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        let _ = write!(output, "{byte:02x}");
    }
    output
}

fn write_bytes(path: &Path, bytes: &[u8]) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("could not create {}", parent.display()))?;
    }
    fs::write(path, bytes).with_context(|| format!("could not write {}", path.display()))
}
