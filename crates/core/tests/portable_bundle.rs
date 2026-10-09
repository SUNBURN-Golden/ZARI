//! Protocol wiring for the portable bundle. Zip cases live in `portable.rs`.

use serde_json::{Value, json};
use zari_core::{BUILD_ID, Runtime};

fn send(runtime: &mut Runtime, id: &str, command: Value) -> Value {
    let raw = json!({
        "meta": {
            "protocolVersion": 1,
            "schemaVersion": 1,
            "workerSessionId": "session-a",
            "projectActivationId": "system",
            "requestId": id,
            "projectId": "system",
            "editorEpoch": "0",
            "inputRevision": "0",
            "contextId": null
        },
        "command": command
    })
    .to_string();
    serde_json::from_str(&runtime.handle_json(&raw)).unwrap()
}

#[test]
fn portable_commands_are_stateless_and_a_bare_payload_is_rejected() {
    let mut runtime = Runtime::new();
    let ready = send(
        &mut runtime,
        "init",
        json!({
            "kind": "initialize",
            "buildId": BUILD_ID,
            "expectedProtocolVersion": 1,
            "expectedSchemaVersion": 1
        }),
    );
    let names: Vec<_> = ready["event"]["capabilities"]
        .as_array()
        .unwrap()
        .iter()
        .map(|name| name.as_str().unwrap())
        .collect();
    let dispose = names
        .iter()
        .position(|name| *name == "disposeProject")
        .unwrap();
    assert_eq!(names[dispose - 2], "buildPortableBundle");
    assert_eq!(names[dispose - 1], "inspectPortableBundle");
    assert_eq!(
        send(
            &mut runtime,
            "bare-build",
            json!({"kind": "buildPortableBundle"})
        )["event"]["code"],
        "invalid_input"
    );
    assert_eq!(
        send(
            &mut runtime,
            "bare-inspect",
            json!({"kind": "inspectPortableBundle"})
        )["event"]["code"],
        "invalid_input"
    );
    let built = send(
        &mut runtime,
        "build",
        json!({
            "kind": "buildPortableBundle",
            "exportedAt": "2026-10-09T00:00:00.000Z",
            "inclusion": {
                "project": true,
                "observations": false,
                "catalog": false,
                "snapshotAttachments": false
            },
            "projectJson": r#"{"project":{"projectId":"p"},"draft":null,"actionProgress":[]}"#,
            "observationsJson": "",
            "catalogJson": "",
            "snapshotsJson": "",
            "attachmentsJson": ""
        }),
    );
    assert_eq!(built["event"]["kind"], "portableBundleBuilt");
    assert_eq!(built["event"]["reply"]["accepted"], true);
    let zip = built["event"]["reply"]["zipBase64"].as_str().unwrap();
    let inspected = send(
        &mut runtime,
        "inspect",
        json!({"kind": "inspectPortableBundle", "zipBase64": zip}),
    );
    assert_eq!(inspected["event"]["kind"], "portableBundleInspected");
    assert_eq!(inspected["event"]["reply"]["accepted"], true);
    assert_eq!(
        inspected["event"]["reply"]["policy"]["photoBytes"],
        "excluded"
    );
    let bomb = send(
        &mut runtime,
        "bomb",
        json!({"kind": "inspectPortableBundle", "zipBase64": "AAAA"}),
    );
    assert_eq!(bomb["event"]["reply"]["accepted"], false);
    assert_eq!(bomb["event"]["reply"]["projectJson"], "");
}
