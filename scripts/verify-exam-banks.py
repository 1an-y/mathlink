#!/usr/bin/env python3
"""真题卷题库校验器：检查 data/banks/exams 下指定卷（或全部卷）的结构完整性与一致性。

用法：python3 scripts/verify-exam-banks.py [math1] [2019] ...  （无参数=全部）
输出：每卷一行 PASS/FAIL 与问题明细；exit code = FAIL 卷数
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXAMS = ROOT / "data/banks/exams"

EXPECTED_TOTAL = {2007: 24}  # 历史特殊年份


def check_paper(bank: dict) -> list[str]:
    issues = []
    problems = bank.get("problems", [])
    year, paper = bank.get("year"), bank.get("paper")
    n = len(problems)
    if year and year >= 2004 and n != EXPECTED_TOTAL.get(year, 22 if year >= 2021 else 23):
        issues.append(f"题数 {n} != 标准 22/23")
    if year and year < 2004 and n < 10:
        issues.append(f"题数过少 {n}")
    nums = [p.get("number") for p in problems]
    if nums != sorted(nums) or (nums and nums[0] != 1):
        issues.append(f"题号非升序或不从 1 开始: {nums[:8]}...")
    if nums and nums != list(range(1, len(nums) + 1)):
        gaps = [i for i in range(nums[0], nums[-1] + 1) if i not in nums]
        if gaps:
            issues.append(f"题号缺号: {gaps}")
    for p in problems:
        q = p.get("questionText", "")
        if not q or "待校对补充" in q:
            issues.append(f"第 {p.get('number')} 题: 题干缺失")
        if q.count("$") % 2 != 0 or q.count("$$") % 2 != 0:
            issues.append(f"第 {p.get('number')} 题: LaTeX $ 不配对")
        if not p.get("source", {}).get("year"):
            issues.append(f"第 {p.get('number')} 题: source.year 缺失")
        a = p.get("answerText", "")
        if a and a.count("$$") % 2 != 0:
            issues.append(f"第 {p.get('number')} 题: 答案 LaTeX 不配对")
        if bank.get("verified") and "待校对" in p.get("notes", ""):
            issues.append(f"第 {p.get('number')} 题: verified 但 notes 仍标注待校对")
    return issues


def main() -> None:
    filters = sys.argv[1:]
    targets = sorted(EXAMS.glob("*/*.json"))
    fail = 0
    for path in targets:
        bank = json.loads(path.read_text(encoding="utf-8"))
        if bank.get("format") != "mathlink-bank":
            continue
        key = f"{bank['paper']} {bank['year']}"
        if filters and not any(f in key for f in filters):
            continue
        issues = check_paper(bank)
        status = "PASS" if not issues else "FAIL"
        if issues:
            fail += 1
        print(f"{status} {key}: {len(bank.get('problems', []))} 题")
        for issue in issues[:6]:
            print(f"    - {issue}")
        if len(issues) > 6:
            print(f"    ... 共 {len(issues)} 项")
    print(f"\nFAIL 卷数: {fail}")
    sys.exit(min(fail, 125))


if __name__ == "__main__":
    main()
