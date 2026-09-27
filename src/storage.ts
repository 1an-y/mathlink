import type { Attempt, AttemptResult, Problem, ProblemDraft, TagKind, TaxonomyItem } from "./types";
import { invoke } from "@tauri-apps/api/core";
import { seedDefinitions, type DefinitionEntry } from "./definitions";
import { getCustomTags } from "./taxonomy";
import calculusBank from "../data/banks/calculus-bank-v1.json";
import linearAlgebraBank from "../data/banks/linear-algebra-bank-v1.json";
import probabilityBank from "../data/banks/probability-bank-v1.json";

const builtinBankProblems: Problem[] = [
  ...(calculusBank.problems as unknown as Problem[]),
  ...(linearAlgebraBank.problems as unknown as Problem[]),
  ...(probabilityBank.problems as unknown as Problem[]),
];

const legacyStorageKey = "mathlink.problems.v1";
const storageKey = "mathlink.problems.v2";
const customTagsKey = "mathlink.custom-tags.v1";
const definitionsKey = "mathlink.definitions.v1";

/** 备份导入结果：新写入条数与因 id 已存在而跳过（不覆盖）的条数 */
export interface ImportStats {
  imported: number;
  skipped: number;
}

interface BackupPayload {
  format?: string;
  version?: number;
  problems?: Problem[];
  customTags?: Partial<Record<TagKind, TaxonomyItem[]>>;
  definitions?: DefinitionEntry[];
}

/**
 * localStorage v1 → v2 惰性迁移：读取时若 v2 不存在而 v1 存在，
 * 解析 v1 并为每题补 `origin: "user"`（其余可选字段留空）后写入 v2。
 * v1 原样保留（旧版 app 回滚仍可读）；一旦 v2 存在，永远以 v2 为准。
 * 解析失败时保持与既有容错一致：不写入 v2，读取路径回退为空列表。
 */
function migrateLegacyProblems(): void {
  if (localStorage.getItem(storageKey) !== null) return;
  const legacy = localStorage.getItem(legacyStorageKey);
  if (legacy === null) return;
  try {
    const problems = JSON.parse(legacy) as Problem[];
    if (!Array.isArray(problems)) return;
    localStorage.setItem(storageKey, JSON.stringify(
      problems.map((problem) => ({ ...problem, origin: problem.origin ?? "user" }))
    ));
  } catch {
    // v1 数据损坏时不产生 v2，read() 将按既有容错回退为 []
  }
}

function read(): Problem[] {
  migrateLegacyProblems();
  try {
    return JSON.parse(localStorage.getItem(storageKey) || "[]") as Problem[];
  } catch {
    return [];
  }
}

function write(problems: Problem[]) {
  localStorage.setItem(storageKey, JSON.stringify(problems));
}

export async function listProblems(): Promise<Problem[]> {
  if (isTauri()) return invoke<Problem[]>("list_problems");
  return read().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/// 启动时种子内置题库：按 id 幂等合并，已存在的跳过（保留做题记录），新版本追加的内置题自动补入。
export async function seedBuiltinBanks(): Promise<ImportStats> {
  if (isTauri()) {
    try {
      return await invoke<ImportStats>("bulk_import_problems", { problems: builtinBankProblems });
    } catch (error) {
      console.warn("内置题库种子导入失败", error);
      return { imported: 0, skipped: 0 };
    }
  }
  const existing = new Set(read().map((problem) => problem.id));
  const fresh = builtinBankProblems.filter((problem) => !existing.has(problem.id));
  if (fresh.length > 0) write([...fresh, ...read()]);
  return { imported: fresh.length, skipped: builtinBankProblems.length - fresh.length };
}

export async function createProblem(draft: ProblemDraft): Promise<Problem> {
  if (isTauri()) return invoke<Problem>("create_problem", { draft });
  const problem: Problem = {
    ...draft,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    attempts: []
  };
  write([problem, ...read()]);
  return problem;
}

export async function addAttempt(problemId: string, result: AttemptResult, note: string): Promise<Attempt> {
  if (isTauri()) return invoke<Attempt>("add_attempt", { problemId, result, note });
  const attempt: Attempt = { id: crypto.randomUUID(), result, note, createdAt: new Date().toISOString() };
  write(read().map((problem) => problem.id === problemId
    ? { ...problem, attempts: [attempt, ...problem.attempts] }
    : problem));
  return attempt;
}

function isTauri() {
  return "__TAURI_INTERNALS__" in window;
}

function readDefinitions(): DefinitionEntry[] {
  try {
    const stored = localStorage.getItem(definitionsKey);
    if (!stored) return seedDefinitions;
    const entries = JSON.parse(stored) as DefinitionEntry[];
    const ids = new Set(entries.map((entry) => entry.id));
    return [...entries, ...seedDefinitions.filter((entry) => !ids.has(entry.id))];
  } catch {
    return seedDefinitions;
  }
}

export async function exportBackup(): Promise<string> {
  const problems = await listProblems();
  return JSON.stringify({
    format: "mathlink-backup",
    version: 2,
    exportedAt: new Date().toISOString(),
    problems,
    customTags: getCustomTags(),
    definitions: readDefinitions()
  }, null, 2);
}

/** 按 id 合流：已存在的条目保留当前值，新条目追加到尾部 */
function mergeById<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const ids = new Set(current.map((item) => item.id));
  return [...current, ...incoming.filter((item) => !ids.has(item.id))];
}

/** 浏览器路径：problems 按 id 合并进 v2（已存在的 id 跳过、不覆盖），新题在前（对齐 createProblem 的写入顺序） */
function importProblemsLocally(problems: Problem[]): ImportStats {
  const existing = read();
  const ids = new Set(existing.map((problem) => problem.id));
  const fresh = problems.filter((problem) => typeof problem?.id === "string" && !ids.has(problem.id));
  write([...fresh, ...existing]);
  return { imported: fresh.length, skipped: problems.length - fresh.length };
}

/** customTags 按 id 去重合流进 mathlink.custom-tags.v1 */
function importCustomTags(tags: Partial<Record<TagKind, TaxonomyItem[]>>): void {
  const current = getCustomTags();
  const merged: Record<TagKind, TaxonomyItem[]> = {
    problem_type: mergeById(current.problem_type, Array.isArray(tags.problem_type) ? tags.problem_type : []),
    knowledge_point: mergeById(current.knowledge_point, Array.isArray(tags.knowledge_point) ? tags.knowledge_point : []),
    method: mergeById(current.method, Array.isArray(tags.method) ? tags.method : [])
  };
  localStorage.setItem(customTagsKey, JSON.stringify(merged));
}

/** definitions 按 id 去重合流进 mathlink.definitions.v1 */
function importDefinitions(definitions: DefinitionEntry[]): void {
  let current: DefinitionEntry[] = [];
  try {
    current = JSON.parse(localStorage.getItem(definitionsKey) || "[]") as DefinitionEntry[];
  } catch {
    current = [];
  }
  localStorage.setItem(definitionsKey, JSON.stringify(mergeById(current, definitions)));
}

/**
 * 导入 exportBackup() 产出的备份（format "mathlink-backup"、version 2），与现有数据安全合流：
 * - problems：按 id 合并，已存在的 id 跳过、不覆盖；Tauri 端走 bulk_import_problems（跨分支契约）
 * - customTags / definitions：两种后端都合流进 localStorage，按 id 去重
 * 与 createProblem / addAttempt 相同的读写模式：写入即生效，调用方随后 listProblems() 即得最新数据。
 */
export async function importBackup(payload: string): Promise<ImportStats> {
  let backup: BackupPayload;
  try {
    backup = JSON.parse(payload) as BackupPayload;
  } catch {
    throw new Error("备份文件不是有效的 JSON，无法导入");
  }
  if (!backup || backup.format !== "mathlink-backup") {
    throw new Error("备份文件格式不正确：缺少 format \"mathlink-backup\" 标识");
  }
  if (backup.version !== 2) {
    throw new Error(`备份版本不支持：${String(backup.version)}，当前仅支持 version 2`);
  }
  const problems = Array.isArray(backup.problems) ? backup.problems : [];
  const stats = isTauri()
    ? await invoke<ImportStats>("bulk_import_problems", { problems })
    : importProblemsLocally(problems);
  importCustomTags(backup.customTags ?? {});
  importDefinitions(Array.isArray(backup.definitions) ? backup.definitions : []);
  return stats;
}
