use serde_json::Value;
use std::{collections::BTreeSet, env, fs, path::PathBuf};
use zari_core::{BootstrapFixture, DomainFixture, evaluate_probe, execute_domain_fixture};
fn collect(dir: PathBuf, paths: &mut Vec<PathBuf>) -> Result<(), Box<dyn std::error::Error>> {
    for entry in fs::read_dir(dir)? {
        let path = entry?.path();
        if path.is_dir() {
            collect(path, paths)?;
        } else if path.extension().is_some_and(|e| e == "json")
            && path.file_name().is_some_and(|n| n != "manifest.json")
        {
            paths.push(path);
        }
    }
    Ok(())
}
fn run_bootstrap(fixture: &BootstrapFixture) -> Result<Value, String> {
    if fixture.fixture_schema_version != 1
        || fixture.schema_version != 1
        || fixture.operation != "evaluateProbe"
        || fixture.engine_context.build_id != zari_core::BUILD_ID
    {
        return Err("unsupported fixture contract".into());
    }
    let result = evaluate_probe(&fixture.input);
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
    if actual != fixture.expected {
        return Err(format!("fixture oracle mismatch: {}", fixture.case_id));
    }
    serde_json::to_value(&result).map_err(|e| e.to_string())
}
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let path = env::args_os()
        .nth(1)
        .ok_or("usage: fixture_runner <fixtures directory>")?;
    let mut paths = vec![];
    collect(PathBuf::from(path), &mut paths)?;
    paths.sort();
    let mut output = vec![];
    let mut ids = BTreeSet::new();
    for path in paths {
        let bytes = fs::read(&path)?;
        let header: Value = serde_json::from_slice(&bytes)?;
        let operation = header
            .get("operation")
            .and_then(Value::as_str)
            .ok_or("fixture missing operation")?;
        let (case_id, result) = if operation == "evaluateProbe" {
            let fixture: BootstrapFixture = serde_json::from_slice(&bytes)?;
            (
                fixture.case_id.clone(),
                run_bootstrap(&fixture).map_err(|e| format!("{}: {e}", fixture.case_id))?,
            )
        } else {
            let fixture: DomainFixture = serde_json::from_slice(&bytes)?;
            (
                fixture.case_id.clone(),
                execute_domain_fixture(&fixture)
                    .map_err(|e| format!("{}: {e}", fixture.case_id))?,
            )
        };
        if !ids.insert(case_id.clone()) {
            return Err("duplicate fixture caseId".into());
        }
        output.push(serde_json::json!({"caseId":case_id,"result":result}));
    }
    output.sort_by(|a, b| a["caseId"].as_str().cmp(&b["caseId"].as_str()));
    println!("{}", serde_json::to_string(&output)?);
    Ok(())
}
