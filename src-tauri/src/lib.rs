use base64::{engine::general_purpose::STANDARD, Engine};
use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::{fs, path::{Path, PathBuf}, sync::Mutex};
use tauri::{Manager, State};
use uuid::Uuid;

struct AppState {
    db_path: PathBuf,
    attachment_dir: PathBuf,
    lock: Mutex<()>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Attempt {
    id: String,
    result: String,
    note: String,
    created_at: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProblemSource {
    kind: String,
    #[serde(default)]
    year: Option<i64>,
    #[serde(default)]
    paper: Option<String>,
    #[serde(default)]
    number: Option<i64>,
    #[serde(default)]
    book: Option<String>,
    #[serde(default)]
    section: Option<String>,
    #[serde(default)]
    license: Option<String>,
}

/// 批量导入结果统计（camelCase 序列化，与前端 storage.ts 的 ImportStats 对齐）。
#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ImportStats {
    imported: i64,
    skipped: i64,
}

/// 题库包文件（data/banks/*.json）；顶层其余字段（subject/license 等）serde 默认忽略。
#[derive(Deserialize)]
struct BankFile {
    format: String,
    #[serde(default)]
    #[allow(dead_code)]
    version: i64,
    #[serde(default)]
    problems: Vec<Problem>,
}

fn default_origin() -> String {
    "user".to_string()
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Problem {
    id: String,
    title: String,
    question_images: Vec<String>,
    answer_images: Vec<String>,
    primary_chapter_id: String,
    secondary_chapter_ids: Vec<String>,
    primary_problem_type_id: String,
    secondary_problem_type_ids: Vec<String>,
    knowledge_point_ids: Vec<String>,
    method_ids: Vec<String>,
    notes: String,
    created_at: String,
    attempts: Vec<Attempt>,
    #[serde(default)]
    question_text: Option<String>,
    #[serde(default)]
    answer_text: Option<String>,
    #[serde(default = "default_origin")]
    origin: String,
    #[serde(default)]
    difficulty: Option<i64>,
    #[serde(default)]
    source: Option<ProblemSource>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProblemDraft {
    title: String,
    question_images: Vec<String>,
    answer_images: Vec<String>,
    primary_chapter_id: String,
    secondary_chapter_ids: Vec<String>,
    primary_problem_type_id: String,
    secondary_problem_type_ids: Vec<String>,
    knowledge_point_ids: Vec<String>,
    method_ids: Vec<String>,
    notes: String,
    #[serde(default)]
    question_text: Option<String>,
    #[serde(default)]
    answer_text: Option<String>,
    #[serde(default = "default_origin")]
    origin: String,
    #[serde(default)]
    difficulty: Option<i64>,
    #[serde(default)]
    source: Option<ProblemSource>,
}

fn open_db(state: &AppState) -> Result<Connection, String> {
    Connection::open(&state.db_path).map_err(|error| error.to_string())
}

/// 当前 SQLite schema 版本（PRAGMA user_version）。
/// 旧库未设版本时 user_version 为 0，按 0 起步逐级迁移。
const DB_SCHEMA_VERSION: i64 = 1;

fn init_db(path: &Path) -> Result<(), String> {
    let mut connection = Connection::open(path).map_err(|error| error.to_string())?;
    schema_and_migrate(&mut connection)
}

/// 建表 + 逐级迁移；测试中直接对内存库调用。
fn schema_and_migrate(connection: &mut Connection) -> Result<(), String> {
    connection.execute_batch(
        "PRAGMA foreign_keys = ON;
         CREATE TABLE IF NOT EXISTS problems (
           id TEXT PRIMARY KEY, title TEXT NOT NULL, primary_chapter_id TEXT NOT NULL,
           secondary_chapter_ids TEXT NOT NULL, primary_problem_type_id TEXT NOT NULL,
           secondary_problem_type_ids TEXT NOT NULL, knowledge_point_ids TEXT NOT NULL,
           method_ids TEXT NOT NULL, notes TEXT NOT NULL, created_at TEXT NOT NULL
         );
         CREATE TABLE IF NOT EXISTS attachments (
           id TEXT PRIMARY KEY, problem_id TEXT NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
           kind TEXT NOT NULL, file_path TEXT NOT NULL, position INTEGER NOT NULL
         );
         CREATE TABLE IF NOT EXISTS attempts (
           id TEXT PRIMARY KEY, problem_id TEXT NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
           result TEXT NOT NULL, note TEXT NOT NULL, created_at TEXT NOT NULL
         );"
    ).map_err(|error| error.to_string())?;
    migrate_db(connection)
}

/// 基于 PRAGMA user_version 的逐级迁移：0 → 1 添加题目文本 / 来源 / 难度 / 内置标记列。
/// 后续版本在其后追加 `if version < N { ... }` 步骤即可。
fn migrate_db(connection: &mut Connection) -> Result<(), String> {
    let version: i64 = connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(|error| error.to_string())?;
    if version >= DB_SCHEMA_VERSION {
        return Ok(());
    }
    let transaction = connection.transaction().map_err(|error| error.to_string())?;
    if version < 1 {
        transaction
            .execute_batch(
                "ALTER TABLE problems ADD COLUMN question_text TEXT;
                 ALTER TABLE problems ADD COLUMN answer_text TEXT;
                 ALTER TABLE problems ADD COLUMN origin TEXT NOT NULL DEFAULT 'user';
                 ALTER TABLE problems ADD COLUMN difficulty INTEGER;
                 ALTER TABLE problems ADD COLUMN source_json TEXT;",
            )
            .map_err(|error| error.to_string())?;
    }
    transaction
        .pragma_update(None, "user_version", DB_SCHEMA_VERSION)
        .map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())
}

fn save_data_url(data_url: &str, directory: &Path, stem: &str) -> Result<PathBuf, String> {
    let (header, encoded) = data_url.split_once(',').ok_or("Invalid image data")?;
    let extension = if header.contains("image/png") { "png" } else if header.contains("image/webp") { "webp" } else { "jpg" };
    let bytes = STANDARD.decode(encoded).map_err(|error| error.to_string())?;
    fs::create_dir_all(directory).map_err(|error| error.to_string())?;
    let path = directory.join(format!("{stem}.{extension}"));
    fs::write(&path, bytes).map_err(|error| error.to_string())?;
    Ok(path)
}

fn load_data_url(path: &str) -> String {
    let file = Path::new(path);
    let mime = match file.extension().and_then(|value| value.to_str()) {
        Some("png") => "image/png", Some("webp") => "image/webp", _ => "image/jpeg"
    };
    fs::read(file).map(|bytes| format!("data:{mime};base64,{}", STANDARD.encode(bytes))).unwrap_or_default()
}

fn json_vec(value: String) -> Vec<String> {
    serde_json::from_str(&value).unwrap_or_default()
}

#[tauri::command]
fn list_problems(state: State<AppState>) -> Result<Vec<Problem>, String> {
    let _guard = state.lock.lock().map_err(|error| error.to_string())?;
    let connection = open_db(&state)?;
    let mut statement = connection.prepare("SELECT id,title,primary_chapter_id,secondary_chapter_ids,primary_problem_type_id,secondary_problem_type_ids,knowledge_point_ids,method_ids,notes,created_at,question_text,answer_text,origin,difficulty,source_json FROM problems ORDER BY created_at DESC").map_err(|error| error.to_string())?;
    let rows = statement.query_map([], |row| Ok((row.get::<_,String>(0)?,row.get::<_,String>(1)?,row.get::<_,String>(2)?,row.get::<_,String>(3)?,row.get::<_,String>(4)?,row.get::<_,String>(5)?,row.get::<_,String>(6)?,row.get::<_,String>(7)?,row.get::<_,String>(8)?,row.get::<_,String>(9)?,row.get::<_,Option<String>>(10)?,row.get::<_,Option<String>>(11)?,row.get::<_,Option<String>>(12)?,row.get::<_,Option<i64>>(13)?,row.get::<_,Option<String>>(14)?))).map_err(|error| error.to_string())?;
    let mut problems = Vec::new();
    for row in rows {
        let (id,title,chapter,secondary_chapters,problem_type,secondary_types,knowledge,methods,notes,created_at,question_text,answer_text,origin,difficulty,source_json) = row.map_err(|error| error.to_string())?;
        let mut attachment_query = connection.prepare("SELECT kind,file_path FROM attachments WHERE problem_id=?1 ORDER BY position").map_err(|error| error.to_string())?;
        let attachments = attachment_query.query_map([&id], |row| Ok((row.get::<_,String>(0)?,row.get::<_,String>(1)?))).map_err(|error| error.to_string())?;
        let mut question_images = Vec::new(); let mut answer_images = Vec::new();
        for attachment in attachments { let (kind,path) = attachment.map_err(|error| error.to_string())?; if kind == "question" { question_images.push(load_data_url(&path)); } else { answer_images.push(load_data_url(&path)); } }
        let mut attempt_query = connection.prepare("SELECT id,result,note,created_at FROM attempts WHERE problem_id=?1 ORDER BY created_at DESC").map_err(|error| error.to_string())?;
        let attempts = attempt_query.query_map([&id], |row| Ok(Attempt { id:row.get(0)?,result:row.get(1)?,note:row.get(2)?,created_at:row.get(3)? })).map_err(|error| error.to_string())?.collect::<Result<Vec<_>,_>>().map_err(|error| error.to_string())?;
        problems.push(Problem { id,title,question_images,answer_images,primary_chapter_id:chapter,secondary_chapter_ids:json_vec(secondary_chapters),primary_problem_type_id:problem_type,secondary_problem_type_ids:json_vec(secondary_types),knowledge_point_ids:json_vec(knowledge),method_ids:json_vec(methods),notes,created_at,attempts,question_text,answer_text,origin:origin.unwrap_or_else(default_origin),difficulty,source:source_json.and_then(|value| serde_json::from_str(&value).ok()) });
    }
    Ok(problems)
}

/// 共享插入：题目行 + 图片附件（create_problem 与批量导入共用，避免两份 SQL 漂移）。
fn insert_problem(transaction: &rusqlite::Transaction<'_>, problem: &Problem, attachment_dir: &Path) -> Result<(), String> {
    let source_json = problem.source.as_ref().and_then(|value| serde_json::to_string(value).ok());
    transaction.execute(
        "INSERT INTO problems (id,title,primary_chapter_id,secondary_chapter_ids,primary_problem_type_id,secondary_problem_type_ids,knowledge_point_ids,method_ids,notes,created_at,question_text,answer_text,origin,difficulty,source_json) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)",
        params![
            &problem.id, &problem.title, &problem.primary_chapter_id,
            serde_json::to_string(&problem.secondary_chapter_ids).unwrap(),
            &problem.primary_problem_type_id,
            serde_json::to_string(&problem.secondary_problem_type_ids).unwrap(),
            serde_json::to_string(&problem.knowledge_point_ids).unwrap(),
            serde_json::to_string(&problem.method_ids).unwrap(),
            &problem.notes, &problem.created_at,
            problem.question_text.as_deref(), problem.answer_text.as_deref(),
            &problem.origin, problem.difficulty, source_json
        ]
    ).map_err(|error| error.to_string())?;
    let directory = attachment_dir.join(&problem.id);
    for (index, image) in problem.question_images.iter().enumerate() {
        let path = save_data_url(image, &directory, &format!("question-{index}"))?;
        transaction.execute("INSERT INTO attachments VALUES (?1,?2,'question',?3,?4)", params![Uuid::new_v4().to_string(), problem.id, path.to_string_lossy(), index]).map_err(|error| error.to_string())?;
    }
    for (index, image) in problem.answer_images.iter().enumerate() {
        let path = save_data_url(image, &directory, &format!("answer-{index}"))?;
        transaction.execute("INSERT INTO attachments VALUES (?1,?2,'answer',?3,?4)", params![Uuid::new_v4().to_string(), problem.id, path.to_string_lossy(), index]).map_err(|error| error.to_string())?;
    }
    Ok(())
}

/// 按 id 幂等导入：已存在的跳过（保留用户侧数据），事务整体提交。
fn import_problems_on(connection: &mut Connection, problems: &[Problem], attachment_dir: &Path) -> Result<ImportStats, String> {
    let transaction = connection.transaction().map_err(|error| error.to_string())?;
    let mut stats = ImportStats::default();
    for problem in problems {
        let exists: i64 = transaction
            .query_row("SELECT COUNT(*) FROM problems WHERE id=?1", [&problem.id], |row| row.get(0))
            .map_err(|error| error.to_string())?;
        if exists > 0 {
            stats.skipped += 1;
            continue;
        }
        insert_problem(&transaction, problem, attachment_dir)?;
        stats.imported += 1;
    }
    transaction.commit().map_err(|error| error.to_string())?;
    Ok(stats)
}

#[tauri::command]
fn bulk_import_problems(problems: Vec<Problem>, state: State<AppState>) -> Result<ImportStats, String> {
    let _guard = state.lock.lock().map_err(|error| error.to_string())?;
    let mut connection = open_db(&state)?;
    import_problems_on(&mut connection, &problems, &state.attachment_dir)
}

#[tauri::command]
fn import_bank_from_file(path: String, state: State<AppState>) -> Result<ImportStats, String> {
    let _guard = state.lock.lock().map_err(|error| error.to_string())?;
    let content = fs::read_to_string(&path).map_err(|error| format!("无法读取题库文件：{error}"))?;
    let bank: BankFile = serde_json::from_str(&content).map_err(|error| format!("题库文件解析失败：{error}"))?;
    if bank.format != "mathlink-bank" {
        return Err("不是有效的 mathlink 题库包（format 字段不匹配）".to_string());
    }
    let mut connection = open_db(&state)?;
    import_problems_on(&mut connection, &bank.problems, &state.attachment_dir)
}

#[tauri::command]
fn create_problem(draft: ProblemDraft, state: State<AppState>) -> Result<Problem, String> {
    let _guard = state.lock.lock().map_err(|error| error.to_string())?;
    let mut connection = open_db(&state)?;
    let transaction = connection.transaction().map_err(|error| error.to_string())?;
    let problem = Problem {
        id: Uuid::new_v4().to_string(),
        created_at: Utc::now().to_rfc3339(),
        attempts: Vec::new(),
        title: draft.title,
        question_images: draft.question_images,
        answer_images: draft.answer_images,
        primary_chapter_id: draft.primary_chapter_id,
        secondary_chapter_ids: draft.secondary_chapter_ids,
        primary_problem_type_id: draft.primary_problem_type_id,
        secondary_problem_type_ids: draft.secondary_problem_type_ids,
        knowledge_point_ids: draft.knowledge_point_ids,
        method_ids: draft.method_ids,
        notes: draft.notes,
        question_text: draft.question_text,
        answer_text: draft.answer_text,
        origin: draft.origin,
        difficulty: draft.difficulty,
        source: draft.source,
    };
    insert_problem(&transaction, &problem, &state.attachment_dir)?;
    transaction.commit().map_err(|error| error.to_string())?;
    Ok(problem)
}

#[tauri::command]
fn add_attempt(problem_id: String, result: String, note: String, state: State<AppState>) -> Result<Attempt, String> {
    let _guard = state.lock.lock().map_err(|error| error.to_string())?;
    let connection = open_db(&state)?; let attempt=Attempt{id:Uuid::new_v4().to_string(),result,note,created_at:Utc::now().to_rfc3339()};
    connection.execute("INSERT INTO attempts VALUES (?1,?2,?3,?4,?5)",params![&attempt.id,&problem_id,&attempt.result,&attempt.note,&attempt.created_at]).map_err(|error| error.to_string())?;
    Ok(attempt)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir=app.path().app_data_dir()?; fs::create_dir_all(&data_dir)?;
            let attachment_dir=data_dir.join("attachments"); fs::create_dir_all(&attachment_dir)?;
            let db_path=data_dir.join("mathlink.db"); init_db(&db_path).map_err(std::io::Error::other)?;
            app.manage(AppState{db_path,attachment_dir,lock:Mutex::new(())}); Ok(())
        })
        .invoke_handler(tauri::generate_handler![list_problems,create_problem,add_attempt,bulk_import_problems,import_bank_from_file])
        .run(tauri::generate_context!())
        .expect("error while running MathLink");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample(id: &str) -> Problem {
        Problem {
            id: id.to_string(),
            title: format!("题目 {id}"),
            question_images: Vec::new(),
            answer_images: Vec::new(),
            primary_chapter_id: "multiple_integral".to_string(),
            secondary_chapter_ids: Vec::new(),
            primary_problem_type_id: "double_integral".to_string(),
            secondary_problem_type_ids: Vec::new(),
            knowledge_point_ids: vec!["integration_order".to_string()],
            method_ids: Vec::new(),
            notes: String::new(),
            created_at: "2026-09-27T00:00:00.000Z".to_string(),
            attempts: Vec::new(),
            question_text: Some(r#"$\iint_D xy\,\mathrm{d}\sigma$"#.to_string()),
            answer_text: Some(r#"$$\dfrac{1}{12}$$"#.to_string()),
            origin: "builtin".to_string(),
            difficulty: Some(3),
            source: Some(ProblemSource {
                kind: "example".to_string(),
                year: None,
                paper: None,
                number: None,
                book: Some("Active Calculus Multivariable".to_string()),
                section: Some("Double Integrals".to_string()),
                license: Some("CC BY-SA 4.0".to_string()),
            }),
        }
    }

    fn setup() -> Connection {
        let mut connection = Connection::open_in_memory().expect("open memory db");
        schema_and_migrate(&mut connection).expect("init schema");
        connection
    }

    #[test]
    fn bulk_import_is_idempotent() {
        let mut connection = setup();
        let attachment_dir = std::env::temp_dir();
        let problems = vec![sample("bank.cal.1"), sample("bank.cal.2"), sample("bank.cal.3")];
        let first = import_problems_on(&mut connection, &problems, &attachment_dir).expect("first import");
        assert_eq!((first.imported, first.skipped), (3, 0));
        let second = import_problems_on(&mut connection, &problems, &attachment_dir).expect("second import");
        assert_eq!((second.imported, second.skipped), (0, 3));
        let count: i64 = connection.query_row("SELECT COUNT(*) FROM problems", [], |row| row.get(0)).unwrap();
        assert_eq!(count, 3);
    }

    #[test]
    fn imported_fields_roundtrip() {
        let mut connection = setup();
        let attachment_dir = std::env::temp_dir();
        import_problems_on(&mut connection, &[sample("bank.cal.1")], &attachment_dir).expect("import");
        let (question_text, origin, difficulty, source_json): (Option<String>, Option<String>, Option<i64>, Option<String>) = connection
            .query_row("SELECT question_text,origin,difficulty,source_json FROM problems WHERE id='bank.cal.1'", [], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
            })
            .unwrap();
        assert_eq!(question_text.as_deref(), Some(r#"$\iint_D xy\,\mathrm{d}\sigma$"#));
        assert_eq!(origin.as_deref(), Some("builtin"));
        assert_eq!(difficulty, Some(3));
        let source: ProblemSource = serde_json::from_str(&source_json.expect("source json")).unwrap();
        assert_eq!(source.kind, "example");
        assert_eq!(source.book.as_deref(), Some("Active Calculus Multivariable"));
    }

    #[test]
    fn migration_backfills_origin_on_legacy_schema() {
        let mut connection = Connection::open_in_memory().unwrap();
        // 手工构造 v0 旧表（无新列），验证迁移回填 origin='user'
        connection.execute_batch(
            "CREATE TABLE problems (id TEXT PRIMARY KEY, title TEXT NOT NULL, primary_chapter_id TEXT NOT NULL,
             secondary_chapter_ids TEXT NOT NULL, primary_problem_type_id TEXT NOT NULL, secondary_problem_type_ids TEXT NOT NULL,
             knowledge_point_ids TEXT NOT NULL, method_ids TEXT NOT NULL, notes TEXT NOT NULL, created_at TEXT NOT NULL);
             INSERT INTO problems VALUES ('old-1','旧题','c','[]','p','[]','[]','[]','','2020-01-01T00:00:00Z');"
        ).unwrap();
        schema_and_migrate(&mut connection).expect("migrate legacy");
        let origin: String = connection.query_row("SELECT origin FROM problems WHERE id='old-1'", [], |row| row.get(0)).unwrap();
        assert_eq!(origin, "user");
        let version: i64 = connection.query_row("PRAGMA user_version", [], |row| row.get(0)).unwrap();
        assert_eq!(version, DB_SCHEMA_VERSION);
    }
}
