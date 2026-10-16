//! Native stage profile for the z-performance-budget report.
//!
//! Usage: `cargo run -p zari-core --release --locked --example perf_profile -- fixtures/bench [iterations]`
//!
//! For every domain fixture it drives the same request sequence the browser
//! bench uses through `Runtime::handle_json` on a fresh runtime, and prints per
//! command p50/p95/max wall time plus request/response bytes. It also times the
//! pieces of the request boundary on the same bytes (JSON parse, canonical
//! re-serialisation, typed decode) so a command's cost can be split into
//! boundary and domain parts. Every response is hashed so two builds can be
//! compared for byte-identical canonical output (`digest=`). Wall time never
//! influences a result; it is only reported.
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{collections::BTreeMap, env, fs, path::PathBuf, time::Instant};
use zari_core::{
    CatalogContent, CatalogSnapshot, DomainFixture, ProtocolRequest, Runtime, canonical,
    domain_fixture_requests, validate,
};

fn percentile(sorted: &[f64], p: f64) -> f64 {
    if sorted.is_empty() {
        return 0.0;
    }
    let rank = ((p * sorted.len() as f64).ceil() as usize).clamp(1, sorted.len());
    sorted[rank - 1]
}
fn summary(mut ms: Vec<f64>) -> String {
    ms.sort_by(|a, b| a.partial_cmp(b).expect("finite"));
    format!(
        "p50={:.3} p95={:.3} max={:.3}",
        percentile(&ms, 0.5),
        percentile(&ms, 0.95),
        ms.last().copied().unwrap_or(0.0)
    )
}
fn ms_since(start: Instant) -> f64 {
    start.elapsed().as_secs_f64() * 1000.0
}
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = env::args().skip(1);
    let dir = PathBuf::from(
        args.next()
            .ok_or("usage: perf_profile <dir> [iterations]")?,
    );
    let iterations: usize = args.next().map(|v| v.parse()).transpose()?.unwrap_or(20);
    let mut paths: Vec<PathBuf> = fs::read_dir(&dir)?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().is_some_and(|e| e == "json"))
        .collect();
    paths.sort();
    for path in paths {
        let fixture: DomainFixture = serde_json::from_slice(&fs::read(&path)?)?;
        let requests = domain_fixture_requests(&fixture);
        let texts: Vec<String> = requests.iter().map(Value::to_string).collect();
        let kinds: Vec<String> = requests
            .iter()
            .map(|r| r["command"]["kind"].as_str().unwrap_or("?").to_owned())
            .collect();
        let mut times: BTreeMap<String, Vec<f64>> = BTreeMap::new();
        let mut digests: BTreeMap<String, String> = BTreeMap::new();
        for _ in 0..iterations {
            let mut runtime = Runtime::new();
            runtime.set_search_engine(Box::new(zari_solver::SolverEngine));
            for (text, kind) in texts.iter().zip(&kinds) {
                let start = Instant::now();
                let reply = runtime.handle_json(text);
                let elapsed = ms_since(start);
                if kind != "stepSearch" {
                    times.entry(kind.clone()).or_default().push(elapsed);
                    digests.insert(
                        kind.clone(),
                        format!("{:x}", Sha256::digest(reply.as_bytes()))[..16].to_owned(),
                    );
                } else {
                    times.entry("stepSearch".into()).or_default().push(elapsed);
                }
                let terminal = ["searchCompleted", "searchCancelled", "operationFailed"]
                    .iter()
                    .any(|k| reply.contains(&format!("\"kind\":\"{k}\"")));
                if kind == "stepSearch" && terminal {
                    break;
                }
            }
        }
        println!("fixture {}", fixture.case_id);
        for (kind, ms) in times {
            let bytes = texts
                .iter()
                .zip(&kinds)
                .find(|(_, k)| **k == kind)
                .map_or(0, |(t, _)| t.len());
            println!(
                "  {kind:<16} n={:<5} {} requestBytes={bytes} digest={}",
                ms.len(),
                summary(ms),
                digests.get(&kind).map_or("-", String::as_str)
            );
        }
        // Boundary pieces on the largest request of this fixture.
        if let Some(big) = texts.iter().max_by_key(|t| t.len()) {
            let (mut parse, mut canon, mut typed) = (vec![], vec![], vec![]);
            for _ in 0..iterations {
                let start = Instant::now();
                let value: Value = serde_json::from_str(big)?;
                parse.push(ms_since(start));
                let start = Instant::now();
                let again = value.to_string();
                canon.push(ms_since(start));
                std::hint::black_box(&again);
                let start = Instant::now();
                let _typed: Result<ProtocolRequest, _> = serde_json::from_value(value);
                typed.push(ms_since(start));
            }
            println!(
                "  boundary({} bytes): parse {} | canonical {} | typedDecode {}",
                big.len(),
                summary(parse),
                summary(canon),
                summary(typed)
            );
        }
        // Catalog pieces of activation, when the fixture carries a catalog.
        let catalog = requests
            .iter()
            .find_map(|r| r["command"]["context"]["catalog"].as_object().cloned())
            .map(|c| serde_json::from_value::<CatalogSnapshot>(Value::Object(c)))
            .transpose()?;
        if let Some(snapshot) = catalog {
            let (mut from, mut validate_ms, mut digest, mut canon_only) =
                (vec![], vec![], vec![], vec![]);
            for _ in 0..iterations {
                let start = Instant::now();
                let content = CatalogContent::from(&snapshot);
                from.push(ms_since(start));
                let start = Instant::now();
                let diagnostics = validate::validate_catalog_content(&content);
                validate_ms.push(ms_since(start));
                std::hint::black_box(&diagnostics);
                let start = Instant::now();
                let d = canonical::catalog_digest(&content);
                digest.push(ms_since(start));
                std::hint::black_box(&d);
                let start = Instant::now();
                let c = canonical::canonicalize_catalog(&content);
                canon_only.push(ms_since(start));
                std::hint::black_box(&c);
            }
            println!(
                "  catalog: from-snapshot {} | validate {} | digest {} (canonicalize alone {})",
                summary(from),
                summary(validate_ms),
                summary(digest),
                summary(canon_only)
            );
        }
    }
    Ok(())
}
