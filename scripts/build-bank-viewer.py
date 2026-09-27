#!/usr/bin/env python3
"""生成题库静态展示页 tools/bank-viewer.html：把 data/banks/*.json 与 taxonomy 名称映射内嵌进单文件 HTML。

产物零依赖、可 file:// 直接打开（KaTeX 走 CDN，需联网渲染公式）。
用法：python3 scripts/build-bank-viewer.py
"""
import glob
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TAXONOMY_FILES = {
    "calculus": ROOT / "data/calculus-taxonomy-v1.2.json",
    "linear_algebra": ROOT / "data/linear-algebra-taxonomy-v1.json",
    "probability_statistics": ROOT / "data/probability-taxonomy-v1.json",
}

chapter_names: dict[str, str] = {}
kp_names: dict[str, str] = {}
subjects: list[dict] = []
for subject_id, path in TAXONOMY_FILES.items():
    data = json.loads(path.read_text(encoding="utf-8"))
    subjects.append({"id": subject_id, "name": data["subject"]["name"]})
    for chapter in data["chapters"]:
        chapter_names[chapter["id"]] = chapter["name"]
    for coll in ("knowledge_points", "methods"):
        for item in data[coll]:
            kp_names.setdefault(item["id"], item["name"])

banks = []
bank_of: dict[str, str] = {}
for path in sorted(glob.glob(str(ROOT / "data/banks/*.json"))):
    bank = json.loads(Path(path).read_text(encoding="utf-8"))
    if bank.get("format") != "mathlink-bank":
        continue
    banks.append({"subject": bank["subject"], "license": bank.get("license", ""), "problems": bank["problems"]})
    for problem in bank["problems"]:
        bank_of[problem["id"]] = bank["subject"]

payload = json.dumps(
    {"subjects": subjects, "banks": banks, "bankOf": bank_of, "chapterNames": chapter_names, "kpNames": kp_names},
    ensure_ascii=False,
    separators=(",", ":"),
)

template = (ROOT / "scripts/bank-viewer-template.html").read_text(encoding="utf-8")
# JSON 内嵌进 <script> 只需转义 </，避免破坏脚本标签
payload_safe = payload.replace("</", "<\\/")
out = template.replace("__DATA__", payload_safe)

dest = ROOT / "tools/bank-viewer.html"
dest.parent.mkdir(exist_ok=True)
dest.write_text(out, encoding="utf-8")
total = sum(len(b["problems"]) for b in banks)
print(f"生成 {dest}（{total} 题，{len(banks)} 个题库包，{len(out) // 1024} KB）")
