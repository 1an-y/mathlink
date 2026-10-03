#!/usr/bin/env python3
"""把 MathMaster 解析版 OCR 转录中的客观答案合并进数一历年卷（只取答案字母，不搬解析文字）。

版式适配：
  A) `### N. 【答案】X`（2020）
  B) `【答案】X.` 顺序出现（2021/2023/2025，无题号 → 按题序对齐，数量必须匹配）
  C) `### N. 答应选X`（2024）
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OCR = Path("/tmp/kaoyan/ocr-md")

PATTERNS_NUMBERED = [
    re.compile(r"###\s*(\d{1,2})\.?\s*【答案】\s*([A-D])"),
    re.compile(r"###\s*(\d{1,2})\.?\s*答[案]?应?选\s*([A-D])"),
    re.compile(r"^(\d{1,2})[.、，]\s*.*?【答案】\s*([A-D])", re.M),
]


def extract_numbered(md: str) -> dict[int, str] | None:
    for pat in PATTERNS_NUMBERED:
        hits = {int(n): a for n, a in pat.findall(md)}
        if hits:
            return hits
    return None


def extract_sequential(md: str, expected: int) -> list[str] | None:
    answers = re.findall(r"【答案】\s*([A-D])", md)
    if len(answers) != expected:
        return None
    return answers


def main() -> None:
    merged = skipped = 0
    for year in range(2020, 2027):
        md_path = OCR / f"shu1-{year}-sol.md"
        bank_path = ROOT / f"data/banks/exams/math1/{year}.json"
        if not md_path.exists() or not bank_path.exists():
            continue
        md = md_path.read_text(encoding="utf-8")
        bank = json.loads(bank_path.read_text(encoding="utf-8"))
        problems = bank["problems"]
        answers: dict[int, str] = {}
        numbered = extract_numbered(md)
        if numbered:
            answers = numbered
            mode = "题号版式"
        else:
            # 节感知：选择节（1-10 或 1-8）内【答案】字母按顺序对齐
            n_choice = 10 if year >= 2021 else 8
            sec_m = re.search(r"(?:^|\n)#+\s*[一二三]、?\s*选择题.*?(?=(?:\n#+\s*[一二三]、)|\Z)", md, re.S | re.M)
            if sec_m:
                seg = sec_m.group(0)
            else:
                # 无“选择题”节标题（如 2023 从中间开始）：文件开头到填空节即选择节
                cut = re.search(r"(?:\n#+\s*[一二三]、?\s*填空)", md)
                seg = md[:cut.start()] if cut else md
            letters = re.findall(r"【答案】\s*[（(]?\s*([A-D])", seg)
            if len(letters) == n_choice:
                answers = {k + 1: a for k, a in enumerate(letters)}
                mode = f"选择节顺序对齐（{len(letters)} 个 → 题 1..{n_choice}）"
            else:
                print(f"math1 {year}: 选择节字母答案 {len(letters)} != {n_choice}，跳过")
                skipped += 1
                continue
        filled = 0
        for p in problems:
            if not isinstance(p.get("number"), int):
                continue
            a = answers.get(p["number"])
            if a and (not p["answerText"] or "待校对补充" in p["answerText"]):
                p["answerText"] = f"答案：{a}"
                filled += 1
        if filled:
            bank_path.write_text(json.dumps(bank, ensure_ascii=False, indent=1), encoding="utf-8")
            print(f"math1 {year}: [{mode}] 补答案 {filled}/{len(problems)} 题")
            merged += filled
        else:
            print(f"math1 {year}: [{mode}] 无需补（已有答案）")
    print(f"\n合计补入 {merged} 题，跳过卷 {skipped}")


if __name__ == "__main__":
    main()
