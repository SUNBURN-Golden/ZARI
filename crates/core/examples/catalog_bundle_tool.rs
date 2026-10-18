//! Native entry point of the Rust bundle authority for the collection bot.
//! The bot never re-implements validation; it pipes JSON through this tool.
//!   catalog_bundle_tool review            (bundle text on stdin)
//!   catalog_bundle_tool build <createdAt> <generatorVersion>   (items JSON array on stdin)
use std::io::{Read, Write};
use zari_core::catalog_bundle::*;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let mut input = String::new();
    if std::io::stdin()
        .take(MAX_BUNDLE_BYTES as u64 + 1)
        .read_to_string(&mut input)
        .is_err()
    {
        eprintln!("stdin_unreadable");
        std::process::exit(2);
    }
    let out = match args.get(1).map(String::as_str) {
        Some("review") => serde_json::to_string(&review_bundle_text(&input)),
        Some("build") => {
            let (Some(created_at), Some(version)) = (args.get(2), args.get(3)) else {
                eprintln!("usage: build <createdAt> <generatorVersion>");
                std::process::exit(2);
            };
            if input.len() > MAX_BUNDLE_BYTES {
                eprintln!("input_too_large");
                std::process::exit(2);
            }
            let build = build_bundle_from_json(
                &input,
                created_at,
                BundleGenerator {
                    name: "zari-catalog-crawler-bot".into(),
                    version: version.clone(),
                },
            );
            serde_json::to_string(&build)
        }
        _ => {
            eprintln!("usage: catalog_bundle_tool review|build");
            std::process::exit(2);
        }
    };
    let text = out.expect("reply encodes");
    std::io::stdout()
        .write_all(text.as_bytes())
        .expect("stdout writes");
}
