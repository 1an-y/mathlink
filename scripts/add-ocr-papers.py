#!/usr/bin/env python3
"""把 ocr-work 里已完成转录的试卷 md 解析入卷（只处理指定文件，不重建其他卷）。

格式：OCR 整卷转录，题号全卷连续（（N）/(N)/### N. 变体），【答案】/[正确答案] 行内联。
数三 m3-2024 等带商业解析的文档只入库题干与客观答案字母，解析文字一律不收（版权红线）。

用法: python3 scripts/add-ocr-papers.py <md路径> <paper> [--answers-from <md路径>]
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import importlib.util

spec = importlib.util.spec_from_file_location("beb", ROOT / "scripts" / "build-exam-banks.py")
beb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(beb)

OUT = ROOT / "data/banks/exams"
MARKER = re.compile(r"^#{0,6}\s*[(（](\d{1,2})[)）]|^#{0,6}\s*[ \t]*(\d{1,2})\s*[.、．]\s*", re.M)
SECTION = re.compile(r"^#{1,6}\s*[一二三四五六七八九十]、\s*([^\n：:（(]*)", re.M)
PAGE_MARK = re.compile(r"<!--\s*page\s+\d+\s*-->\n?")


def parse_ocr_paper(path: Path, paper: str) -> dict:
    """全卷扫描：题号单调递增链（允许缺号），节=最近的节标题。"""
    raw = beb.clean(path.read_text(encoding="utf-8"))
    raw = PAGE_MARK.sub("", raw)
    year = int(re.search(r"(\d{4})", path.name).group(1))
    # 截掉解析部分（商业解析不入库，版权红线；答案从块内提取客观答案）
    cut = re.search(r"^#{1,6}\s*[^\n]*?(?:试题解析|答案与解析|参考答案)[^\n]*$", raw, re.M)
    answers_block = ""
    if cut:
        answers_block = raw[cut.start():]
        raw = raw[:cut.start()]
    sec_iter = list(SECTION.finditer(raw))
    matches = list(MARKER.finditer(raw))

    def sec_of(pos: int) -> str:
        cur = ""
        for s in sec_iter:
            if s.start() < pos:
                cur = s.group(1).strip()
            else:
                break
        return cur

    ns = [int(next(g for g in m.groups() if g)) for m in matches]
    chain = []
    last = 0
    for m, n in zip(matches, ns):
        if n > last:  # 全卷单调链（允许缺号）
            chain.append((m, n))
            last = n
        # 非递增的（选项内嵌数字等）忽略
    problems = []
    for i, (m, n) in enumerate(chain):
        start = m.end()
        end = chain[i + 1][0].start() if i + 1 < len(chain) else len(raw)
        chunk = raw[start:end].strip()
        ans_m = re.search(r"【答案】\s*(.+?)\s*(?:\n|$)", chunk)
        answer = ans_m.group(1).strip() if ans_m else ""
        question = re.split(r"【答案】", chunk)[0].strip()
        question = re.sub(r"\n{3,}", "\n\n", question)
        problems.append({
            "number": n, "question": question, "answer": answer,
            "explanation": "", "section": sec_of(m.start()),
        })
    return {"year": year, "paper": paper, "problems": problems, "answers_block": answers_block}


def extract_answer_letters(answers_block: str, count: int) -> dict[int, str]:
    """从解析块提取客观答案：优先 [正确答案] X，其次 (N)【答案】X / (N)【答案】<表达式>。"""
    out: dict[int, str] = {}
    for m in re.finditer(r"[\[【]\s*正确答案\s*[\]】]\s*[:：]?\s*([A-D])\b", answers_block):
        out[len(out) + 1] = m.group(1)
    if len(out) >= count:
        return out
    out = {}
    pat = re.compile(
        r"[(（]\s*(\d{1,2})\s*[)）]\s*【答案】\s*(.+?)(?=\s*[(（]\s*\d{1,2}\s*[)）]\s*【答案】|$)",
        re.S)
    for m in pat.finditer(answers_block):
        n = int(m.group(1))
        ans = re.sub(r"\s+", " ", m.group(2)).strip().rstrip(".,;；.")
        if ans:
            out[n] = ans
    return out


def main() -> None:
    md_path = Path(sys.argv[1])
    paper = sys.argv[2]
    parsed = parse_ocr_paper(md_path, paper)
    year = parsed["year"]
    bank = beb.build_bank(parsed, str(md_path))
    bank["license"] = "公开试题 OCR 转录初稿；解析文字未收录，答案为客观答案，待逐题校对"
    bank["notes"] = bank.get("notes", "")
    # 数三 m3-2024：答案在答案与解析块里
    if parsed["answers_block"]:
        letters = extract_answer_letters(parsed["answers_block"], len(parsed["problems"]))
        filled = 0
        for p in bank["problems"]:
            if (not p["answerText"] or p["answerText"] == "（答案待校对补充）") and p["number"] in letters:
                p["answerText"] = f"答案：{letters[p['number']]}"
                filled += 1
        print(f"  从解析块补填 {filled} 个答案（客观答案；解析文字未收录）")
    dest = OUT / paper / f"{year}.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(bank, ensure_ascii=False, indent=1), encoding="utf-8")
    # 更新 index.json（只增改本卷条目）
    idx_path = OUT / "index.json"
    index = json.loads(idx_path.read_text(encoding="utf-8")) if idx_path.exists() else []
    index = [r for r in index if not (r["paper"] == paper and r["year"] == year)]
    index.append({"year": year, "paper": paper, "total": len(parsed["problems"]),
                  "withAnswer": sum(1 for p in parsed["problems"] if p["answer"]),
                  "file": str(dest.relative_to(ROOT))})
    index.sort(key=lambda x: (x["paper"], x["year"]))
    idx_path.write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")
    counts = {p["number"] for p in parsed["problems"]}
    missing = [n for n in range(1, max(counts) + 1) if n not in counts]
    print(f"{paper} {year}: {len(parsed['problems'])} 题 -> {dest.relative_to(ROOT)}"
          f"（含答案 {sum(1 for p in parsed['problems'] if p['answer'])}）"
          f"{'；缺号 ' + str(missing) if missing else ''}")


if __name__ == "__main__":
    main()
