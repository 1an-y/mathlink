#!/usr/bin/env node
/**
 * KaTeX 全量渲染冒烟（审计工具）
 *
 * 覆盖范围：
 *   1. data/banks/exams/{math1,math2}/*.json（78 卷，index.json 为纯索引，跳过）
 *   2. data/banks/ 下 8 个题库 JSON
 *
 * 对每题的 title / questionText / answerText / notes 做公式切分
 * （切分规则与 src/components/FormulaText.tsx 完全一致：$$...$$ 优先于 $...$），
 * 再用 katex.renderToString 逐段渲染（displayMode 按定界符）。
 *
 * 失败 = throwOnError: true 时抛出的 LaTeX 解析/渲染错误。
 * warn（如 ℃ 无字符度量、strict 警告）不算失败，单独记录。
 *
 * 用法：
 *   node tools/katex-smoke-exams.mjs            # 输出人读摘要
 *   node tools/katex-smoke-exams.mjs --json     # 额外把失败/warn 明细以 JSON 打到 stdout
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const require = createRequire(path.join(root, "tools", "noop.js"));

let katex;
try {
  katex = require("katex");
} catch (e) {
  console.error("无法解析 katex（应从工作树 node_modules 解析）:", e.message);
  process.exit(2);
}

const BANKS = [
  "calculus-bank-v1",
  "linear-algebra-bank-v1",
  "probability-bank-v1",
  "calculus-actcal-v1",
  "calculus-actcal2-v1",
  "calculus-actcal3-v1",
  "linear-algebra-hefferon-v1",
  "probability-gs-v1",
];

const FIELDS = ["title", "questionText", "answerText", "notes"];

// 与 src/components/FormulaText.tsx 的切分规则保持一致：
// $$...$$（可跨行）优先于 $...$（不可含换行与 $）
const SPLIT_RE = /(\$\$[\s\S]+?\$\$|\$[^\n$]+?\$)/g;

function splitFormulas(text) {
  const out = [];
  for (const part of String(text).split(SPLIT_RE)) {
    if (!part) continue;
    const display = part.startsWith("$$") && part.endsWith("$$");
    const inline = !display && part.startsWith("$") && part.endsWith("$");
    if (!display && !inline) continue;
    out.push({ formula: part.slice(display ? 2 : 1, display ? -2 : -1), display });
  }
  return out;
}

function collectSources() {
  const sources = [];
  const examsRoot = path.join(root, "data", "banks", "exams");
  for (const sub of fs.readdirSync(examsRoot, { withFileTypes: true })) {
    if (!sub.isDirectory()) continue;
    for (const f of fs.readdirSync(path.join(examsRoot, sub.name)).sort()) {
      if (!f.endsWith(".json")) continue;
      const rel = path.posix.join("data/banks/exams", sub.name, f);
      const json = JSON.parse(fs.readFileSync(path.join(examsRoot, sub.name, f), "utf8"));
      sources.push({ rel, problems: json.problems || [] });
    }
  }
  for (const b of BANKS) {
    const rel = path.posix.join("data/banks", b + ".json");
    const json = JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));
    sources.push({ rel, problems: json.problems || [] });
  }
  return sources;
}

function runSmoke() {
  const sources = collectSources();
  const failures = [];
  const warnings = [];
  const stats = {
    files: sources.length,
    problems: 0,
    texts: 0,
    formulas: 0,
    displayFormulas: 0,
    inlineFormulas: 0,
    failCount: 0,
    warnCount: 0,
  };

  for (const src of sources) {
    for (const p of src.problems) {
      stats.problems++;
      for (const field of FIELDS) {
        const text = p[field];
        if (typeof text !== "string" || !text.includes("$")) continue;
        stats.texts++;
        for (const { formula, display } of splitFormulas(text)) {
          stats.formulas++;
          if (display) stats.displayFormulas++; else stats.inlineFormulas++;
          const warns = [];
          let threw = null;
          const origWarn = console.warn;
          const origErr = console.error;
          console.warn = (...a) => warns.push(a.map(String).join(" "));
          console.error = (...a) => warns.push(a.map(String).join(" "));
          try {
            katex.renderToString(formula, {
              displayMode: display,
              throwOnError: true,
              strict: false,
              trust: false,
            });
          } catch (e) {
            threw = e;
          } finally {
            console.warn = origWarn;
            console.error = origErr;
          }
          if (threw) {
            stats.failCount++;
            failures.push({
              file: src.rel,
              id: p.id,
              field,
              display,
              formula: formula.slice(0, 90),
              error: String(threw.message).slice(0, 60),
            });
          }
          for (const w of warns) {
            stats.warnCount++;
            warnings.push({
              file: src.rel,
              id: p.id,
              field,
              display,
              formula: formula.slice(0, 90),
              warn: w.slice(0, 120),
            });
          }
        }
      }
    }
  }
  return { stats, failures, warnings };
}

function main() {
  const jsonFlag = process.argv.includes("--json");
  const { stats, failures, warnings } = runSmoke();

  console.log("=== KaTeX 全量渲染冒烟 ===");
  console.log(`文件: ${stats.files}（exam 卷 + 8 题库）`);
  console.log(`题目: ${stats.problems}`);
  console.log(`含 $ 文本: ${stats.texts}`);
  console.log(`公式总数: ${stats.formulas}（display $$: ${stats.displayFormulas}，inline $: ${stats.inlineFormulas}）`);
  console.log(`失败: ${stats.failCount}`);
  console.log(`warn（不算失败）: ${stats.warnCount}`);

  if (failures.length) {
    console.log("\n--- 失败清单 ---");
    for (const f of failures) {
      console.log(`[${f.file}] ${f.id} (${f.field}${f.display ? ", display" : ""})`);
      console.log(`  公式: ${f.formula}`);
      console.log(`  错误: ${f.error}`);
    }
  }
  if (warnings.length) {
    console.log("\n--- warn 记录（前 40 条）---");
    const seen = new Set();
    let shown = 0;
    for (const w of warnings) {
      const key = w.warn + "|" + w.formula;
      if (seen.has(key)) continue;
      seen.add(key);
      if (shown++ >= 40) break;
      console.log(`[${w.file}] ${w.id} (${w.field}) 公式=${w.formula} warn=${w.warn}`);
    }
    console.log(`（去重样例 ${Math.min(shown, 40)}/${warnings.length} 条）`);
  }

  if (jsonFlag) {
    console.log("\n---JSON---");
    console.log(JSON.stringify({ stats, failures, warnings }, null, 2));
  }

  process.exitCode = stats.failCount > 0 ? 1 : 0;
}

main();
