use std::{collections::BTreeSet, env, fs, path::PathBuf};
use zari_core::{BootstrapFixture, evaluate_probe};
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let path = env::args_os()
        .nth(1)
        .ok_or("usage: fixture_runner fixtures/bootstrap")?;
    let mut paths: Vec<PathBuf> = fs::read_dir(path)?
        .map(|r| r.map(|e| e.path()))
        .collect::<Result<_, _>>()?;
    paths.retain(|p| p.extension().is_some_and(|e| e == "json"));
    paths.sort();
    let mut output = vec![];
    let mut ids = BTreeSet::new();
    for path in paths {
        let f: BootstrapFixture = serde_json::from_slice(&fs::read(path)?)?;
        if f.fixture_schema_version != 1
            || f.schema_version != 1
            || f.operation != "evaluateProbe"
            || f.engine_context.build_id != zari_core::BUILD_ID
        {
            return Err("unsupported fixture contract".into());
        }
        if !ids.insert(f.case_id.clone()) {
            return Err("duplicate fixture caseId".into());
        }
        let result = evaluate_probe(&f.input);
        let actual = zari_core::FixtureExpected {
            width_status: result.width_check.status.clone(),
            required_width_mm: result
                .required_width_mm
                .value()
                .map(|v| v.get().to_string()),
            x_positions_mm: result
                .row_objects
                .value()
                .map(|objects| objects.iter().map(|v| v.x_mm.get().to_string()).collect()),
            packs_to_order: result.order.packs_to_order.value().map(|v| v.get()),
            supplied_units: result.order.supplied_units.value().map(|v| v.get()),
            surplus_units: result.order.surplus_units.value().map(|v| v.get()),
            diagnostic_fields: result
                .diagnostics
                .iter()
                .map(|d| d.field_path.clone())
                .collect(),
        };
        if actual != f.expected {
            return Err(format!("fixture oracle mismatch: {}", f.case_id).into());
        }
        output.push(serde_json::json!({"caseId":f.case_id,"result":result}));
    }
    output.sort_by(|a, b| a["caseId"].as_str().cmp(&b["caseId"].as_str()));
    println!("{}", serde_json::to_string(&output)?);
    Ok(())
}
