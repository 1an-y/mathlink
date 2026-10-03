#!/usr/bin/env python3
"""把文本级真题 markdown 源解析为 mathlink-bank 格式的历年卷题库（含套题结构）。

来源（只读）：
  数一: /home/ros/Projects/mathapp-sources/kaoyan-md-shu1/papers/<年>年考研数学(一)真题.md  (【N】/（N）题号)
  数二: /home/ros/Projects/mathapp-sources/kysx2-zt/考研数二真题-※-刷题版/<年>-2.md        (### N 题号, 含答案解析)

输出: data/banks/exams/<paper>/<year>.json  (mathlink-bank + paperInfo 套题结构)
汇总: data/banks/exams/index.json
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC_M1 = Path("/home/ros/Projects/mathapp-sources/kaoyan-md-shu1/papers")
SRC_M2 = Path("/home/ros/Projects/mathapp-sources/kysx2-zt/考研数二真题-※-刷题版")
OUT = ROOT / "data/banks/exams"

SECTION_PATTERNS = re.compile(r"^#+\s*[一二三四五六七八九十]、\s*(.+?)[（(].*?$|^#+\s*[一二三四五六七八九十]、\s*(.+?)$", re.M)

# 题号→科目映射（按年代题量结构；区间外的标 None）。
# 23 题时代（~2009-2020）数一：高数 1-4,9-12,15-19；线代 5-6,13,20-21；概率 7-8,14,22-23
# 22 题时代（2021+）数一：高数 1-4,9-12,15-19；线代 5-6,13,20-21；概率 7-8,14,22
SUBJECT_MAP = {
    "math1": {
        "old": {**{n: "calculus" for n in [1,2,3,4,9,10,11,12,15,16,17,18,19]},
                **{n: "linear_algebra" for n in [5,6,13,20,21]},
                **{n: "probability_statistics" for n in [7,8,14,22,23]}},
        "new": {**{n: "calculus" for n in [1,2,3,4,9,10,11,12,15,16,17,18,19]},
                **{n: "linear_algebra" for n in [5,6,13,20,21]},
                **{n: "probability_statistics" for n in [7,8,14,22]}},
    },
    "math2": {
        "old": {**{n: "calculus" for n in [1,2,3,4,5,6,9,10,11,12,13,15,16,17,18,19,20]},
                **{n: "linear_algebra" for n in [7,8,14,21,22,23]}},
        "new": {**{n: "calculus" for n in [1,2,3,4,5,6,9,10,11,12,13,15,16,17,18,19]},
                **{n: "linear_algebra" for n in [7,8,14,20,21,22]}},
    },
    "math3": {
        "old": {**{n: "calculus" for n in [1,2,3,4,9,10,11,12,15,16,17,18,19]},
                **{n: "linear_algebra" for n in [5,6,13,20,21]},
                **{n: "probability_statistics" for n in [7,8,14,22,23]}},
        "new": {**{n: "calculus" for n in [1,2,3,4,9,10,11,12,15,16,17,18,19]},
                **{n: "linear_algebra" for n in [5,6,13,20,21]},
                **{n: "probability_statistics" for n in [7,8,14,22]}},
    },
}


def subject_guess(paper: str, year: int, number: int) -> str | None:
    era = "new" if year >= 2021 else "old"
    return SUBJECT_MAP.get(paper, {}).get(era, {}).get(number)


def clean(text: str) -> str:
    text = re.sub(r"\r", "", text)
    text = re.sub(r"[ \t]+\n", "\n", text)
    return text.strip()


def parse_m2(path: Path) -> dict:
    """数二刷题版：按大题节扫描 + 连续编号过滤（小问 ### 1/2 并入所属大题）。"""
    raw = clean(path.read_text(encoding="utf-8"))
    year = int(re.search(r"(\d{4})-2\.md", path.name).group(1))
    sec_iter = list(re.finditer(r"^##\s*[一二三四五六七八九十]、\s*[^\n]*", raw, re.M))
    marker = re.compile(r"^###\s+(?:(\d{1,2})[.、、]?|[(（](\d{1,2})[)）]|第\s*(\d{1,2})\s*题)\s*[^\n]*$", re.M)
    problems = []
    offset = 0
    for si, sec in enumerate(sec_iter):
        sec_start = sec.end()
        sec_end = sec_iter[si + 1].start() if si + 1 < len(sec_iter) else len(raw)
        body = raw[sec_start:sec_end]
        matches = list(marker.finditer(body))
        if not matches:
            continue
        ns = [int(next(g for g in m.groups() if g)) for m in matches]
        local = min(ns) == 1
        chain = []
        last = 0
        for mi0, (m, n) in enumerate(zip(matches, ns)):
            if local and n > last:
                chain.append((m, n))
                last = n
            elif not local and (n == last + 1 or mi0 == 0):
                chain.append((m, n))
                last = n
        base = offset if local else 0
        for mi, (m, n) in enumerate(chain):
            start = m.end()
            end = chain[mi + 1][0].start() if mi + 1 < len(chain) else sec_end - sec_start
            inline = re.sub(r"^#{2,4}\s*", "", m.group(0))
            inline = re.sub(r"^(\d{1,2})[.、、]?\s*|^[(（]\d{1,2}[)）]\s*|^第\s*\d{1,2}\s*题\s*", "", inline).strip()
            chunk = ((inline + "\n") if inline else "") + body[start:end].strip()
            global_number = base + n
            ans_m = re.search(r"\*\*答案[：:]\*\*\s*(.+?)(?:\n|$)", chunk)
            exp_m = re.search(r"\*\*解析[：:]\*\*\s*\n?(.*?)(?:\Z)", chunk, re.S)
            answer = ans_m.group(1).strip() if ans_m else ""
            explanation = exp_m.group(1).strip() if exp_m else ""
            question = re.split(r"\*\*答案[：:]\*\*", chunk)[0].strip()
            problems.append({
                "number": global_number, "question": question,
                "answer": answer, "explanation": explanation,
                "section": sec.group(0).lstrip("# ").strip(),
            })
        if not chain:
            continue
        if local:
            offset += len(chain)
        else:
            offset = max(offset, max(n for _, n in chain))
    return {"year": year, "paper": "math2", "problems": problems}


def parse_m1(path: Path) -> dict:
    """数一 papers：按大题节扫描，节内局部编号（【N】/（N）/N. 变体），全局题号=节偏移+局部号。"""
    raw = clean(path.read_text(encoding="utf-8"))
    year = int(re.search(r"(\d{4})", path.name).group(1))
    # 按大题节标题切分
    sec_iter = list(re.finditer(r"^#+\s*[一二三四五六七八九十]、\s*[^\n]*", raw, re.M))
    marker = re.compile(r"^(?:【(\d{1,2})】|[(（](\d{1,2})[)）]|(\d{1,2})[.、])\s*", re.M)
    problems = []
    offset = 0
    for si, sec in enumerate(sec_iter):
        sec_start = sec.end()
        sec_end = sec_iter[si + 1].start() if si + 1 < len(sec_iter) else len(raw)
        body = raw[sec_start:sec_end]
        matches = list(marker.finditer(body))
        if not matches:
            continue
        ns = [int(next(g for g in m.groups() if g)) for m in matches]
        local = min(ns) == 1  # 节内从 1 起编（局部），否则为全卷连续编号
        chain = []
        last = 0
        for mi0, (m, n) in enumerate(zip(matches, ns)):
            if local and n > last:  # 单调递增（允许个别题号标记缺失）
                chain.append((m, n))
                last = n
            elif not local and (n == last + 1 or mi0 == 0):
                chain.append((m, n))
                last = n
        base = offset if local else 0
        for mi, (m, n) in enumerate(chain):
            start = m.end()
            end = chain[mi + 1][0].start() if mi + 1 < len(chain) else sec_end - sec_start
            inline = re.sub(r"^#{1,4}\s*", "", m.group(0))
            inline = re.sub(r"^(\d{1,2})[.、]?\s*|^[(（]\d{1,2}[)）]\s*|^【\d{1,2}】\s*", "", inline).strip()
            chunk = ((inline + "\n") if inline else "") + body[start:end].strip()
            global_number = base + n
            ans_m = re.search(r"【答案】\s*(.+?)(?:\n|$)", chunk)
            answer = ans_m.group(1).strip() if ans_m else ""
            question = re.split(r"【答案】", chunk)[0].strip()
            problems.append({
                "number": global_number, "question": question,
                "answer": answer, "explanation": "",
                "section": sec.group(0).lstrip("# ").strip(),
            })
        if not chain:
            continue
        if local:
            offset += len(chain)
        else:
            offset = max(offset, max(n for _, n in chain))
    return {"year": year, "paper": "math1", "problems": problems}


def guess_section(section_titles: list[str], number: int, year: int) -> str:
    if not section_titles:
        return ""
    if number <= 8 or (year >= 2021 and number <= 10):
        return section_titles[0]
    return section_titles[min(len(section_titles) - 1, number // 8)]


def problem_id(paper: str, year: int, number: int) -> str:
    return f"bank.exam.{paper.replace('math','m')}-{year}.{number}"


def build_bank(parsed: dict, source_file: str) -> dict:
    year, paper = parsed["year"], parsed["paper"]
    era = "new" if year >= 2021 else "old"
    choose_fill = {n for n, s in SUBJECT_MAP[paper][era].items() if n < 15}
    problems = []
    order = []
    if not parsed["problems"]:
        raise ValueError(f"0 题: {paper} {year}")
    for p in parsed["problems"]:
        pid = problem_id(paper, year, p["number"])
        subject = subject_guess(paper, year, p["number"]) or ""
        answer = p["answer"]
        if p["explanation"]:
            answer = (answer + "\n\n**解析：**\n" + p["explanation"]).strip()
        answer_text = answer or "（答案待校对补充）"
        problems.append({
            "id": pid,
            "number": p["number"],
            "title": f"{year} 年{paper_label(paper)} 第 {p['number']} 题",
            "questionText": p["question"] or "（题干待校对补充）",
            "answerText": answer_text,
            "questionImages": [], "answerImages": [],
            "primaryChapterId": "", "secondaryChapterIds": [],
            "primaryProblemTypeId": "", "secondaryProblemTypeIds": [],
            "knowledgePointIds": [], "methodIds": [],
            "notes": f"OCR/文本转录初稿，待逐题校对；科目归类为按题号推算（{subject or '未知'}）",
            "createdAt": "2026-09-28T00:00:00.000Z",
            "attempts": [], "origin": "builtin", "difficulty": None,
            "source": {"kind": "exam", "year": year, "paper": paper, "number": p["number"]},
            "subjectGuess": subject,
            "section": p["section"],
        })
        order.append({"number": p["number"], "id": pid, "subjectGuess": subject,
                      "objective": p["number"] in choose_fill})
    return {
        "format": "mathlink-bank", "version": 1, "subject": "exam_mixed",
        "year": year, "paper": paper,
        "license": "公开试题重排转录，解析为来源社区整理，校对后仅保留题干与客观答案",
        "verified": False,
        "source": source_file,
        "paperInfo": {
            "year": year, "paper": paper, "label": paper_label(paper),
            "sections": parsed["problems"][0]["section"] and list(dict.fromkeys(p["section"] for p in parsed["problems"])) or [],
            "problemsOrder": order,
            "total": len(order),
        },
        "problems": problems,
    }


def paper_label(paper: str) -> str:
    return {"math1": "数学一", "math2": "数学二", "math3": "数学三"}.get(paper, paper)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    index = []
    for path in sorted(SRC_M2.glob("*-2.md")):
        try:
            parsed = parse_m2(path)
        except Exception as e:
            print(f"[skip] {path.name}: {e}", file=sys.stderr)
            continue
        try:
            bank = build_bank(parsed, str(path))
        except ValueError as e:
            print(f"[empty] {path.name}: {e}", file=sys.stderr)
            continue
        dest = OUT / "math2" / f"{parsed['year']}.json"
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(json.dumps(bank, ensure_ascii=False, indent=1), encoding="utf-8")
        index.append({"year": parsed["year"], "paper": "math2", "total": len(parsed["problems"]),
                      "withAnswer": sum(1 for p in parsed["problems"] if p["answer"]),
                      "file": str(dest.relative_to(ROOT))})
    for path in sorted(SRC_M1.glob("*.md")):
        if "答案" in path.name or "解析" in path.name:
            continue
        try:
            parsed = parse_m1(path)
        except Exception as e:
            print(f"[skip] {path.name}: {e}", file=sys.stderr)
            continue
        try:
            bank = build_bank(parsed, str(path))
        except ValueError as e:
            print(f"[empty] {path.name}: {e}", file=sys.stderr)
            continue
        dest = OUT / "math1" / f"{parsed['year']}.json"
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(json.dumps(bank, ensure_ascii=False, indent=1), encoding="utf-8")
        index.append({"year": parsed["year"], "paper": "math1", "total": len(parsed["problems"]),
                      "withAnswer": sum(1 for p in parsed["problems"] if p["answer"]),
                      "file": str(dest.relative_to(ROOT))})
    index.sort(key=lambda x: (x["paper"], x["year"]))
    (OUT / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")
    for row in index:
        flag = "" if row["total"] in (22, 23) or row["year"] < 2009 else "  <-- 检查"
        print(f"{row['paper']} {row['year']}: {row['total']} 题 (含答案 {row['withAnswer']}){flag}")


if __name__ == "__main__":
    main()
