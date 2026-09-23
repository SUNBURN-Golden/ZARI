use schemars::{JsonSchema, generate::SchemaSettings};
use serde_json::{Value, json};
use zari_core::*;
fn schema<T: JsonSchema>() -> Value {
    let mut value = serde_json::to_value(
        SchemaSettings::draft07()
            .into_generator()
            .into_root_schema_for::<T>(),
    )
    .expect("schema serializes");
    fn clean(value: &mut Value) {
        match value {
            Value::Object(map) => {
                if map.get("format").and_then(Value::as_str) == Some("uint32") {
                    map.remove("format");
                    map.insert("maximum".into(), json!(u32::MAX));
                }
                for v in map.values_mut() {
                    clean(v);
                }
            }
            Value::Array(a) => {
                for v in a {
                    clean(v);
                }
            }
            _ => {}
        }
    }
    clean(&mut value);
    value
}
fn main() {
    println!(
        "{}",
        serde_json::to_string_pretty(&json!({
            "ProtocolRequest":schema::<ProtocolRequest>(),
            "ProtocolResponse":schema::<ProtocolResponse>(),
            "BootstrapProbeDto":schema::<BootstrapProbeDto>(),
            "BootstrapProbeResult":schema::<BootstrapProbeResult>(),
            "BootstrapFixture":schema::<BootstrapFixture>(),
            "DomainFixture":schema::<DomainFixture>(),
            "RawProjectInputDto":schema::<RawProjectInputDto>(),
            "ProjectInput":schema::<ProjectInput>(),
            "CatalogImportDto":schema::<CatalogImportDto>(),
            "CatalogSnapshot":schema::<CatalogSnapshot>(),
            "PlanSnapshot":schema::<PlanSnapshot>(),
            "VerifiableRecordDto":schema::<VerifiableRecordDto>(),
            "RawCatalogFieldDto":schema::<RawCatalogFieldDto>(),
            "NormalizedCatalogField":schema::<NormalizedCatalogField>(),
            "SnapshotBinding":schema::<SnapshotBinding>(),
            "LayoutEditCommand":schema::<LayoutEditCommand>()
        }))
        .expect("schema serializes")
    );
}
