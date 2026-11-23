//! Checks the native schema against the web's, through the contract the web's tests write
//! (`src/livestore/__tests__/fixtures/native-contract.json`): each native table has the web's
//! columns, and replaying the contract's events through the native materializers writes the
//! rows the web's wrote, step by step, in the tables this app keeps. Events the app doesn't
//! keep must change none of them. Regenerate the contract with
//! `bun run contract:livestore:update` at the repo root.

use std::collections::BTreeMap;

use livestore_core::{Event, SeqNum};
use livestore_sqlite::{LeaderDb, materialize_event};
use serde_json::{Map, Value};

use super::library::LINKS_SQL;
use super::schema::schema;

const CONTRACT: &str = include_str!("../../../../src/livestore/__tests__/fixtures/native-contract.json");

fn contract() -> Value {
    serde_json::from_str(CONTRACT).expect("contract JSON")
}

/// Numbers compared by value, so a default of `0` matches `0.0`.
fn same_default(a: Option<&Value>, b: Option<&Value>) -> bool {
    match (a, b) {
        (Some(Value::Number(x)), Some(Value::Number(y))) => x.as_f64() == y.as_f64(),
        _ => a == b,
    }
}

#[test]
fn native_tables_have_the_web_columns() {
    let contract = contract();
    let mut problems = Vec::new();
    for table in schema().tables() {
        let Some(web) = contract["tables"].get(&table.name).and_then(Value::as_object) else {
            problems.push(format!("{}: no such table on the web", table.name));
            continue;
        };
        let native: BTreeMap<&str, _> = table.columns.iter().map(|c| (c.name.as_str(), c)).collect();
        for name in web.keys().filter(|n| !native.contains_key(n.as_str())) {
            problems.push(format!("{}.{name}: missing natively", table.name));
        }
        for (name, c) in &native {
            let Some(w) = web.get(*name) else {
                problems.push(format!("{}.{name}: not on the web", table.name));
                continue;
            };
            let default = c.default.as_ref().and_then(|d| d.resolve()).map(|v| v.to_json_value());
            let ours = (c.ty.as_sql().to_lowercase(), c.nullable, c.primary_key);
            let theirs = (w["type"].as_str().unwrap_or_default().to_owned(), w["nullable"] == true, w["primaryKey"] == true);
            if ours != theirs || !same_default(default.as_ref(), w.get("default")) {
                problems.push(format!("{}.{name}: native {ours:?} default {default:?}, web {theirs:?} default {:?}", table.name, w.get("default")));
            }
        }
    }
    assert!(problems.is_empty(), "the native schema differs from the web's:\n{}", problems.join("\n"));
}

#[test]
fn native_materializers_write_what_the_web_writes() {
    let contract = contract();
    let db = LeaderDb::open_in_memory(schema()).expect("in-memory db");
    let kept: Vec<String> = schema().tables().iter().map(|t| t.name.clone()).collect();
    let order = |table: &str| {
        let keys: Vec<String> = contract["tables"][table]
            .as_object()
            .into_iter()
            .flatten()
            .filter(|(_, c)| c["primaryKey"] == true)
            .map(|(n, _)| format!("\"{n}\""))
            .collect();
        if keys.is_empty() { "rowid".to_owned() } else { keys.join(", ") }
    };
    let mut expected: BTreeMap<&str, Value> = kept.iter().map(|t| (t.as_str(), Value::Array(Vec::new()))).collect();
    let mut parent = SeqNum::ROOT;
    for (i, step) in contract["steps"].as_array().expect("steps").iter().enumerate() {
        let name = step["event"].as_str().expect("event name");
        let seq_num = SeqNum::new(i as i64 + 1, 0, 0);
        let event = Event {
            name: name.to_owned(),
            args: step["args"].clone(),
            seq_num,
            parent_seq_num: parent,
            client_id: "contract".to_owned(),
            session_id: "contract".to_owned(),
        };
        parent = seq_num;
        if let Err(e) = materialize_event(db.state_conn(), db.eventlog_conn(), db.schema(), &event, false, None) {
            panic!("step {i} {name} with {}: the native materializer failed: {e}", step["args"]);
        }
        for (table, rows) in step["changes"].as_object().into_iter().flatten() {
            if let Some(slot) = expected.get_mut(table.as_str()) {
                *slot = rows.clone();
            }
        }
        for table in &kept {
            let rows: Vec<Value> =
                db.query(&format!("SELECT * FROM \"{table}\" ORDER BY {}", order(table))).expect("select").into_iter().map(Value::Object).collect();
            assert_eq!(
                Value::Array(rows),
                expected[table.as_str()],
                "step {i} {name} with {}: native rows in {table} differ from the web's",
                step["args"]
            );
        }
    }
}

#[test]
fn the_links_query_runs_on_the_contract_library() {
    let contract = contract();
    let db = LeaderDb::open_in_memory(schema()).expect("in-memory db");
    let mut parent = SeqNum::ROOT;
    for (i, step) in contract["steps"].as_array().expect("steps").iter().enumerate() {
        let seq_num = SeqNum::new(i as i64 + 1, 0, 0);
        let event = Event {
            name: step["event"].as_str().unwrap_or_default().to_owned(),
            args: step["args"].clone(),
            seq_num,
            parent_seq_num: parent,
            client_id: "contract".to_owned(),
            session_id: "contract".to_owned(),
        };
        parent = seq_num;
        let _ = materialize_event(db.state_conn(), db.eventlog_conn(), db.schema(), &event, false, None);
    }
    let rows = db.query(LINKS_SQL).unwrap_or_else(|e| panic!("the links query fails on the native schema: {e}"));
    let a: &Map<String, Value> = rows.iter().find(|r| r["id"] == "link-a").expect("link-a");
    assert_eq!((&a["title"], &a["summary"], &a["tags"]), (&Value::from("Canvas notes"), &Value::from("A summary.\nOn two lines."), &Value::Null));
}
