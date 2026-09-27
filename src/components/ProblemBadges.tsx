import type { Problem, ProblemSource } from "../types";
import { difficultyStars, formatSource } from "./filters";

/** 来源徽章：真题「2020 · 数一 · 第9题」；例题「书名 §节 · 许可」；自录/无来源不渲染 */
export function SourceBadge({ source }: { source?: ProblemSource }) {
  const text = formatSource(source);
  if (!text) return null;
  return <span className={`badge source-badge kind-${source?.kind}`}>{text}</span>;
}

/** 难度徽章：如 3 → ★★★☆☆（title 提示 n/5） */
export function DifficultyBadge({ difficulty }: { difficulty?: Problem["difficulty"] }) {
  const stars = difficultyStars(difficulty);
  if (!stars) return null;
  return <span className="badge difficulty-badge" title={`难度 ${difficulty}/5`}>{stars}</span>;
}

/** 内置题目标识：verbose 时显示“内置题库 · 只读”（详情页），卡片上显示“内置” */
export function BuiltinBadge({ verbose = false }: { verbose?: boolean }) {
  return <span className="badge builtin-problem-badge">{verbose ? "内置题库 · 只读" : "内置"}</span>;
}
