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
    migrate_db(&mut connection)
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

#[tauri::command]
fn create_problem(draft: ProblemDraft, state: State<AppState>) -> Result<Problem, String> {
    let _guard = state.lock.lock().map_err(|error| error.to_string())?;
    let mut connection = open_db(&state)?;
    let transaction = connection.transaction().map_err(|error| error.to_string())?;
    let id = Uuid::new_v4().to_string(); let created_at = Utc::now().to_rfc3339();
    let source_json = draft.source.as_ref().and_then(|value| serde_json::to_string(value).ok());
    transaction.execute("INSERT INTO problems (id,title,primary_chapter_id,secondary_chapter_ids,primary_problem_type_id,secondary_problem_type_ids,knowledge_point_ids,method_ids,notes,created_at,question_text,answer_text,origin,difficulty,source_json) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)", params![&id,&draft.title,&draft.primary_chapter_id,serde_json::to_string(&draft.secondary_chapter_ids).unwrap(),&draft.primary_problem_type_id,serde_json::to_string(&draft.secondary_problem_type_ids).unwrap(),serde_json::to_string(&draft.knowledge_point_ids).unwrap(),serde_json::to_string(&draft.method_ids).unwrap(),&draft.notes,&created_at,draft.question_text.as_deref(),draft.answer_text.as_deref(),&draft.origin,draft.difficulty,source_json]).map_err(|error| error.to_string())?;
    let directory = state.attachment_dir.join(&id);
    let mut question_images = Vec::new(); let mut answer_images = Vec::new();
    for (index,image) in draft.question_images.iter().enumerate() { let path=save_data_url(image,&directory,&format!("question-{index}"))?; transaction.execute("INSERT INTO attachments VALUES (?1,?2,'question',?3,?4)",params![Uuid::new_v4().to_string(),id,path.to_string_lossy(),index]).map_err(|error| error.to_string())?; question_images.push(image.clone()); }
    for (index,image) in draft.answer_images.iter().enumerate() { let path=save_data_url(image,&directory,&format!("answer-{index}"))?; transaction.execute("INSERT INTO attachments VALUES (?1,?2,'answer',?3,?4)",params![Uuid::new_v4().to_string(),id,path.to_string_lossy(),index]).map_err(|error| error.to_string())?; answer_images.push(image.clone()); }
    transaction.commit().map_err(|error| error.to_string())?;
    Ok(Problem { id, title:draft.title, question_images, answer_images, primary_chapter_id:draft.primary_chapter_id, secondary_chapter_ids:draft.secondary_chapter_ids, primary_problem_type_id:draft.primary_problem_type_id, secondary_problem_type_ids:draft.secondary_problem_type_ids, knowledge_point_ids:draft.knowledge_point_ids, method_ids:draft.method_ids, notes:draft.notes, created_at, attempts:Vec::new(), question_text:draft.question_text, answer_text:draft.answer_text, origin:draft.origin, difficulty:draft.difficulty, source:draft.source })
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
        .invoke_handler(tauri::generate_handler![list_problems,create_problem,add_attempt])
        .run(tauri::generate_context!())
        .expect("error while running MathLink");
}
