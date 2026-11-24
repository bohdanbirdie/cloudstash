//! Checks the native schema against the web's through the LiveStore contract in
//! `tools/livestore-contract` (see its README): every native table has the
//! columns `schema.json` lists, and replaying each scenario through the native
//! materializers writes, step by step, the rows the scenario expects in the tables
//! this app keeps. Events the app doesn't keep must change none of them. The web
//! side records the scenarios with `bun run contract` at the repo root.

use std::collections::BTreeMap;
use std::path::PathBuf;

use livestore_core::{Event, SeqNum};
use livestore_sqlite::{LeaderDb, materialize_event};
use serde_json::{Map, Value};

use super::library::LINKS_SQL;
use super::schema::schema;

fn contract_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../tools/livestore-contract")
}

fn read_json(path: PathBuf) -> Value {
    let text = std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("{}: {e}", path.display()));
    serde_json::from_str(&text).unwrap_or_else(|e| panic!("{}: {e}", path.display()))
}

/// Every scenario file, by name.
fn scenarios() -> Vec<(String, Value)> {
    let dir = contract_dir().join("scenarios");
    let mut files: Vec<PathBuf> = std::fs::read_dir(&dir)
        .unwrap_or_else(|e| panic!("{}: {e}", dir.display()))
        .map(|entry| entry.expect("scenario entry").path())
        .filter(|path| path.extension().is_some_and(|ext| ext == "json"))
        .collect();
    files.sort();
    assert!(!files.is_empty(), "no scenarios in {}", dir.display());
    files.into_iter().map(|path| (path.file_name().unwrap().to_string_lossy().into_owned(), read_json(path))).collect()
}

/// Numbers compared by value, so a default of `0` matches `0.0`.
fn same_default(a: Option<&Value>, b: Option<&Value>) -> bool {
    match (a, b) {
        (Some(Value::Number(x)), Some(Value::Number(y))) => x.as_f64() == y.as_f64(),
        _ => a == b,
    }
}

/// Plays a scenario's steps into `db`, calling `after_step` after each one.
fn play(db: &LeaderDb, scenario: &Value, mut after_step: impl FnMut(usize, &str, &Value)) {
    let mut parent = SeqNum::ROOT;
    for (i, step) in scenario["steps"].as_array().expect("steps").iter().enumerate() {
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
            panic!("step {} {name} with {}: the native materializer failed: {e}", i + 1, step["args"]);
        }
        after_step(i, name, step);
    }
}

#[test]
fn native_tables_have_the_web_columns() {
    let web_tables = read_json(contract_dir().join("schema.json"))["tables"].clone();
    let mut problems = Vec::new();
    for table in schema().tables() {
        let Some(web) = web_tables[&table.name]["columns"].as_array() else {
            problems.push(format!("{}: no such table on the web", table.name));
            continue;
        };
        let web: BTreeMap<&str, &Value> = web.iter().map(|c| (c["name"].as_str().unwrap_or_default(), c)).collect();
        let native: BTreeMap<&str, _> = table.columns.iter().map(|c| (c.name.as_str(), c)).collect();
        for name in web.keys().filter(|n| !native.contains_key(*n)) {
            problems.push(format!("{}.{name}: missing natively", table.name));
        }
        for (name, c) in &native {
            let Some(w) = web.get(name) else {
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
fn native_materializers_write_what_the_scenarios_expect() {
    let web_tables = read_json(contract_dir().join("schema.json"))["tables"].clone();
    let order = |table: &str| {
        let keys: Vec<String> = web_tables[table]["columns"]
            .as_array()
            .into_iter()
            .flatten()
            .filter(|c| c["primaryKey"] == true)
            .map(|c| format!("\"{}\"", c["name"].as_str().unwrap_or_default()))
            .collect();
        if keys.is_empty() { "rowid".to_owned() } else { keys.join(", ") }
    };
    let kept: Vec<String> = schema().tables().iter().map(|t| t.name.clone()).collect();
    for (file, scenario) in scenarios() {
        let db = LeaderDb::open_in_memory(schema()).expect("in-memory db");
        let mut expected: BTreeMap<&str, Value> = kept.iter().map(|t| (t.as_str(), Value::Array(Vec::new()))).collect();
        play(&db, &scenario, |i, name, step| {
            for (table, rows) in step["expect"].as_object().into_iter().flatten() {
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
                    "{file} step {} {name} with {}: native rows in {table} differ from the web's",
                    i + 1,
                    step["args"]
                );
            }
        });
    }
}

#[test]
fn the_links_query_runs_on_the_links_scenario() {
    let (_, links) = scenarios().into_iter().find(|(file, _)| file == "links.json").expect("links.json scenario");
    let db = LeaderDb::open_in_memory(schema()).expect("in-memory db");
    play(&db, &links, |_, _, _| {});
    let rows = db.query(LINKS_SQL).unwrap_or_else(|e| panic!("the links query fails on the native schema: {e}"));
    let a: &Map<String, Value> = rows.iter().find(|r| r["id"] == "link-a").expect("link-a");
    assert_eq!((&a["title"], &a["summary"], &a["tags"]), (&Value::from("Canvas notes"), &Value::from("A summary.\nOn two lines."), &Value::Null));
}
