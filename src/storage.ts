import type { Attempt, AttemptResult, Problem, ProblemDraft } from "./types";
import { invoke } from "@tauri-apps/api/core";

const storageKey = "mathlink.problems.v1";

function read(): Problem[] {
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

export function exportBackup(): string {
  return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), problems: read() }, null, 2);
}
