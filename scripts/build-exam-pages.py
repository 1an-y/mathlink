#!/usr/bin/env python3
"""生成历年真题卷展示页 tools/exam-papers.html（单文件，内嵌全部卷数据与套题结构）。

用法：python3 scripts/build-exam-pages.py   （先运行 build-exam-banks.py 生成 data/banks/exams/）
"""
import glob
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXAMS = ROOT / "data/banks/exams"
DEST = ROOT / "tools/exam-papers.html"

papers = []
for path in sorted(glob.glob(str(EXAMS / "*/*.json"))):
    bank = json.loads(Path(path).read_text(encoding="utf-8"))
    if bank.get("format") != "mathlink-bank":
        continue
    info = bank["paperInfo"]
    papers.append({
        "paper": bank["paper"], "year": bank["year"],
        "label": info.get("label", bank["paper"]),
        "total": info.get("total", len(bank["problems"])),
        "verified": bank.get("verified", False),
        "sections": info.get("sections", []),
        "order": info.get("problemsOrder", []),
        "problems": bank["problems"],
    })

papers.sort(key=lambda p: (p["paper"], p["year"]))
payload = json.dumps(papers, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")

TEMPLATE = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>题间 · 历年真题</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js"></script>
<style>
  :root { --bg:#f7f7f5; --card:#fff; --ink:#1f2430; --sub:#6b7280; --accent:#2f6fed;
    --accent-soft:#eaf1fe; --border:#e5e7eb; --chip:#f1f2f4; }
  @media (prefers-color-scheme: dark) { :root { --bg:#14161c; --card:#1d2029; --ink:#e8eaf0;
    --sub:#9aa1ad; --accent:#6f9bf0; --accent-soft:#26314a; --border:#303542; --chip:#262a35; } }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink);
    font-family:"PingFang SC","Microsoft YaHei","Noto Sans CJK SC",system-ui,sans-serif; }
  header { padding:26px 20px 10px; max-width:920px; margin:0 auto; }
  header h1 { margin:0 0 4px; font-size:24px; }
  header p { margin:0; color:var(--sub); font-size:13px; }
  .papers { max-width:920px; margin:14px auto; padding:0 20px; display:flex; flex-direction:column; gap:14px; }
  .paper-group h2 { font-size:16px; margin:6px 0 8px; color:var(--accent); }
  .year-chips { display:flex; gap:6px; flex-wrap:wrap; }
  .year-chips button { border:1px solid var(--border); background:var(--card); color:var(--ink);
    padding:5px 12px; border-radius:999px; cursor:pointer; font-size:13px; }
  .year-chips button:hover { border-color:var(--accent); }
  .viewer { max-width:920px; margin:16px auto; padding:0 20px; }
  .paper-head { background:var(--card); border:1px solid var(--border); border-radius:14px; padding:16px 18px; margin-bottom:14px; }
  .paper-head h2 { margin:0 0 6px; font-size:20px; }
  .paper-head .meta { color:var(--sub); font-size:13px; display:flex; gap:12px; flex-wrap:wrap; }
  .sections { display:flex; gap:6px; flex-wrap:wrap; margin-top:10px; }
  .sections span { background:var(--chip); border-radius:6px; padding:3px 10px; font-size:12px; color:var(--sub); }
  .warn { color:#b45309; font-size:12px; margin-top:8px; }
  .problem { background:var(--card); border:1px solid var(--border); border-radius:12px; padding:14px 16px; margin-bottom:12px; }
  .p-num { font-size:13px; color:var(--accent); font-weight:600; margin-bottom:6px; display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
  .p-num .tag { background:var(--chip); color:var(--sub); border-radius:6px; padding:1px 8px; font-weight:400; font-size:11px; }
  .q { font-size:15px; line-height:1.8; white-space:pre-wrap; }
  details.ans { margin-top:8px; }
  details.ans summary { cursor:pointer; color:var(--accent); font-size:13px; }
  details.ans .a { border-top:1px dashed var(--border); margin-top:8px; padding-top:8px; font-size:14px; line-height:1.8; white-space:pre-wrap; }
  .katex-display { overflow-x:auto; padding:2px 0; }
  .empty { text-align:center; color:var(--sub); padding:40px; }
  @media print { .papers,.year-chips { display:none; } details.ans summary{display:none;}
    details.ans .a{display:block!important;} .problem{break-inside:avoid;} }
</style>
</head>
<body>
<header>
  <h1>题间 · 历年真题</h1>
  <p>考研数学一 / 二 · 按套卷浏览（转录初稿，逐题校对后入库；数三与近年缺卷由 OCR 队列补齐）</p>
</header>
<div class="papers" id="paperList"></div>
<div class="viewer" id="viewer"></div>
<script>
const PAPERS = __DATA__;
const LABEL = { math1:"数学一", math2:"数学二", math3:"数学三" };
const SUBJECT = { calculus:"高数", linear_algebra:"线代", probability_statistics:"概率", "":"—" };
const esc = s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
let current = null;

function renderList() {
  const groups = {};
  for (const p of PAPERS) (groups[p.paper] ||= []).push(p);
  document.getElementById("paperList").innerHTML = Object.entries(groups).map(([paper, list]) =>
    `<div class="paper-group"><h2>${LABEL[paper] || paper}（${list.length} 卷）</h2><div class="year-chips">` +
    list.map(p => `<button data-key="${p.paper}-${p.year}">${p.year}${p.verified ? "" : "·"}</button>`).join("") +
    `</div></div>`).join("");
}
function renderPaper(key) {
  const p = PAPERS.find(x => `${x.paper}-${x.year}` === key);
  if (!p) return;
  current = p;
  const orderMap = new Map(p.order.map(o => [o.number, o]));
  document.getElementById("viewer").innerHTML =
    `<div class="paper-head"><h2>${p.year} 年${p.label}真题</h2>
      <div class="meta"><span>${p.total} 题</span><span>${p.verified ? "已校对" : "转录初稿（· 标记）"}</span></div>
      <div class="sections">${p.sections.map(s => `<span>${esc(s)}</span>`).join("")}</div>
      ${p.verified ? "" : `<div class="warn">初稿由文本源转录，题号/公式以原卷为准待逐题校对；部分年份题干不全（源缺失）。</div>`}</div>` +
    p.problems.map(pr => {
      const o = orderMap.get(pr.number) || {};
      return `<article class="problem">
        <div class="p-num">第 ${pr.number} 题
          <span class="tag">${SUBJECT[o.subjectGuess] || "—"}</span>
          ${o.objective ? `<span class="tag">客观题</span>` : `<span class="tag">解答题</span>`}
        </div>
        <div class="q">${esc(pr.questionText || "")}</div>
        ${pr.answerText && pr.answerText !== "（答案待校对补充）"
          ? `<details class="ans"><summary>查看答案 / 解析</summary><div class="a">${esc(pr.answerText)}</div></details>` : ""}
      </article>`;
    }).join("");
  if (window.renderMathInElement) renderMathInElement(document.getElementById("viewer"),
    { delimiters: [{left:"$$",right:"$$",display:true},{left:"$",right:"$",display:false}], throwOnError:false });
  window.scrollTo({ top: 0 });
}
document.addEventListener("click", e => {
  const b = e.target.closest("button[data-key]");
  if (b) renderPaper(b.dataset.key);
});
window.addEventListener("DOMContentLoaded", () => {
  renderList();
  if (window.renderMathInElement) renderPaper(PAPERS[PAPERS.length - 1].paper + "-" + PAPERS[PAPERS.length - 1].year);
});
</script>
</body>
</html>
"""

DEST.write_text(TEMPLATE.replace("__DATA__", payload), encoding="utf-8")
print(f"生成 {DEST}（{len(papers)} 卷，{sum(p['total'] for p in papers)} 题，{DEST.stat().st_size // 1024} KB）")
