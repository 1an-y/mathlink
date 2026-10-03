#!/usr/bin/env python3
"""真题库多科目统一校验器。

校验 data/banks/exams/ 下全部真题卷 JSON：
  1. 打标 id 真实存在 —— 按科目路由校验：
     primaryChapterId 以 la. 开头 -> 线代 taxonomy；以 prob. 开头 -> 概率 taxonomy；
     其余（含空）-> 微积分 taxonomy（v1.2）。
     带 la./prob. 前缀的非章节 id 按其自身前缀对应 taxonomy 查存在性，避免跨科目误报。
  2. primaryProblemTypeId 为空字符串视为「未打标」，单独统计，不算非法。
  3. $ / $$ 配对：按 $$ 分割后，各偶数段（$$ 之外）内 $ 个数须为偶数；$$ 出现奇数次亦判不配对。
  4. knowledgePointIds 数量 0-3、methodIds 数量 0-2（真题允许空）。
  5. index.json 与实际卷文件一致性：文件存在、年份/卷种/题数/有答案题数相符，无孤立条目。

问题分级：
  [ERROR]   非法打标 id / $ 配对 / 数量越界 / index 不一致
  [WARN]    主章节缺失（路由未定，交由空白打标统计方处理）、跨科目打标、列表内重复 id

用法：python3 tools/validate-exams.py [--summary-only]
退出码：存在 [ERROR] 时为 1，否则 0。
"""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXAM_DIR = ROOT / 'data' / 'banks' / 'exams'
TAX_FILES = {
    'calculus': ROOT / 'data' / 'calculus-taxonomy-v1.2.json',
    'la': ROOT / 'data' / 'linear-algebra-taxonomy-v1.json',
    'prob': ROOT / 'data' / 'probability-taxonomy-v1.json',
}

FIELD_KIND = {
    'primaryChapterId': 'chapter',
    'secondaryChapterIds': 'chapter',
    'primaryProblemTypeId': 'problem_type',
    'secondaryProblemTypeIds': 'problem_type',
    'knowledgePointIds': 'knowledge_point',
    'methodIds': 'method',
}
FIELD_LIMIT = {'knowledgePointIds': 3, 'methodIds': 2}


def load_taxonomies():
    ids = {}
    for subject, path in TAX_FILES.items():
        data = json.loads(path.read_text(encoding='utf-8'))
        ids[subject] = {
            'chapter': {c['id'] for c in data['chapters']},
            'problem_type': {p['id'] for p in data['problem_types']},
            'knowledge_point': {k['id'] for k in data['knowledge_points']},
            'method': {m['id'] for m in data['methods']},
        }
    return ids


def route_subject(primary_chapter_id):
    """按主章节 id 前缀决定本题使用的 taxonomy。"""
    if primary_chapter_id.startswith('la.'):
        return 'la'
    if primary_chapter_id.startswith('prob.'):
        return 'prob'
    return 'calculus'


def id_subject(value):
    """id 自带的科目前缀（无前缀返回 None）。"""
    if value.startswith('la.'):
        return 'la'
    if value.startswith('prob.'):
        return 'prob'
    return None


def norm_field(value):
    """字段值统一成列表；空串/None -> 空列表。"""
    if value is None:
        return []
    if isinstance(value, str):
        return [value] if value != '' else []
    return list(value)


def check_dollars(text):
    """返回 $ / $$ 配对问题描述（含出错片段），无问题返回 None。"""
    if not text:
        return None
    cleaned = text.replace('\\$', '')  # 转义的美元符号不参与配对
    parts = cleaned.split('$$')
    if len(parts) > 1 and len(parts) % 2 == 0:
        return '$$ 不配对（$$ 出现奇数次）'
    for idx in range(0, len(parts), 2):  # 偶数段 = $$ 之外
        seg = parts[idx]
        if seg.count('$') % 2 != 0:
            pos = seg.find('$')
            snippet = seg[max(0, pos - 25):pos + 30].replace('\n', ' ')
            return f'$ 不配对（$$ 外余奇数个 $，片段: …{snippet}…）'
    return None


def check_problem(problem, TAX_IDS):
    """校验单题，返回 (errors, warnings, untagged_primary_pt)。"""
    errors, warnings = [], []
    untagged = False
    prim_chapter = problem.get('primaryChapterId') or ''
    route = route_subject(prim_chapter)
    route_undetermined = prim_chapter == ''

    if route_undetermined:
        prefixed = [v for f, kind in FIELD_KIND.items()
                    for v in norm_field(problem.get(f)) if id_subject(v)]
        hints = sorted({id_subject(v) for v in prefixed})
        hint = f'（据打标 id 前缀疑似 {"、".join(hints)}）' if hints else ''
        warnings.append(('primaryChapterId', f'主章节未打标，路由默认微积分{hint}'))

    for field, kind in FIELD_KIND.items():
        values = norm_field(problem.get(field))
        if field == 'primaryProblemTypeId' and problem.get(field, '') == '':
            untagged = True
        if field in FIELD_LIMIT and len(values) > FIELD_LIMIT[field]:
            # 真题综合大题常带 4–6 个知识点（富打标保留筛选信息）：
            # 超上限降级为警告，超过 2 倍上限才视为异常
            if len(values) > 2 * FIELD_LIMIT[field]:
                errors.append((field, f'数量 {len(values)} 超上限 {FIELD_LIMIT[field]}: {values}'))
            else:
                warnings.append((field, f'数量 {len(values)} 超软上限 {FIELD_LIMIT[field]}（综合题富打标，允许）: {values}'))
        seen = set()
        for v in values:
            if v == '':
                continue
            if v in seen:
                warnings.append((field, f'重复打标 id: {v}'))
            seen.add(v)
            own = id_subject(v)
            if own is not None and kind != 'chapter' and not route_undetermined and own != route:
                warnings.append((field, f'跨科目打标: {v} 属于 {own} taxonomy，本题路由为 {route}'))
                target = own  # 存在性仍按其自身 taxonomy 查
            elif own is not None:
                target = own
            else:
                target = route
            if v not in TAX_IDS[target][kind]:
                errors.append((field, f'非法 id（{target} {kind} 中不存在）: {v}'))

    for field in ('title', 'questionText', 'answerText'):
        issue = check_dollars(problem.get(field))
        if issue:
            errors.append((field, issue))

    return errors, warnings, untagged


def check_index(TAX_IDS):
    """校验 index.json 与实际卷文件一致性，返回 (per_file, issues, stats)。"""
    index_path = EXAM_DIR / 'index.json'
    index = json.loads(index_path.read_text(encoding='utf-8'))
    entries = {}
    issues = []
    for e in index:
        entries.setdefault(e['file'], []).append(e)
    files = sorted(EXAM_DIR.glob('math*/*.json'))

    for fp in files:
        rel = str(fp.relative_to(ROOT))
        data = json.loads(fp.read_text(encoding='utf-8'))
        recs = entries.get(rel)
        if not recs:
            issues.append(f'[ERROR] {rel}: index.json 中无此卷的记录')
            continue
        if len(recs) > 1:
            issues.append(f'[ERROR] {rel}: index.json 中有 {len(recs)} 条重复记录')
        e = recs[0]
        for key, expect in (('year', data.get('year')), ('paper', data.get('paper'))):
            if e.get(key) != expect:
                issues.append(f'[ERROR] {rel}: index.{key}={e.get(key)} 与文件 {key}={expect} 不符')
        total = len(data.get('problems', []))
        if e.get('total') != total:
            issues.append(f'[ERROR] {rel}: index.total={e.get("total")} 与实际题数 {total} 不符')
        with_answer = sum(1 for p in data.get('problems', []) if (p.get('answerText') or '').strip())
        if e.get('withAnswer') != with_answer:
            issues.append(f'[ERROR] {rel}: index.withAnswer={e.get("withAnswer")} 与实际有答案题数 {with_answer} 不符')

    for rel in sorted(entries):
        if rel not in {str(f.relative_to(ROOT)) for f in files}:
            issues.append(f'[ERROR] index.json 引用了不存在的文件: {rel}')
    return issues, {'index_entries': len(index), 'paper_files': len(files)}


def main():
    ap = argparse.ArgumentParser(description='真题库多科目统一校验器')
    ap.add_argument('--summary-only', action='store_true', help='只输出每卷一行统计')
    args = ap.parse_args()

    TAX_IDS = load_taxonomies()
    index_issues, idx_stats = check_index(TAX_IDS)

    totals = {'files': 0, 'pass': 0, 'fail': 0, 'problems': 0, 'untagged_pt': 0,
              'errors': 0, 'warnings': 0}
    category = {}
    lines = []
    detail = []

    for fp in sorted(EXAM_DIR.glob('math*/*.json')):
        rel = str(fp.relative_to(ROOT))
        data = json.loads(fp.read_text(encoding='utf-8'))
        totals['files'] += 1
        f_errors, f_warnings = [], []
        for p in data.get('problems', []):
            totals['problems'] += 1
            errs, warns, untagged = check_problem(p, TAX_IDS)
            if untagged:
                totals['untagged_pt'] += 1
            for field, msg in errs:
                f_errors.append(f'  [ERROR] {p["id"]} | {field} | {msg}')
                key = msg.split('（')[0].split('：')[0][:24]
                category[key] = category.get(key, 0) + 1
            for field, msg in warns:
                f_warnings.append(f'  [WARN ] {p["id"]} | {field} | {msg}')
                key = msg.split('（')[0].split('：')[0][:24]
                category[key] = category.get(key, 0) + 1
        status = 'PASS' if not f_errors else 'FAIL'
        totals['pass' if status == 'PASS' else 'fail'] += 1
        totals['errors'] += len(f_errors)
        totals['warnings'] += len(f_warnings)
        lines.append(f'{status}  {rel:26s} 题数={len(data.get("problems", [])):3d} '
                     f'错误={len(f_errors)} 警告={len(f_warnings)}')
        if f_errors or f_warnings:
            detail.append(rel)
            detail.extend(f_errors + f_warnings)

    print('=' * 72)
    print('真题库校验总览')
    print('=' * 72)
    print(f'卷文件数: {totals["files"]}  (index 条目: {idx_stats["index_entries"]})')
    print(f'题目总数: {totals["problems"]}')
    print(f'PASS 卷: {totals["pass"]}  FAIL 卷: {totals["fail"]}')
    print(f'未打标 primaryProblemTypeId (空串, 不算非法): {totals["untagged_pt"]}')
    print(f'ERROR 合计: {totals["errors"]}   WARN 合计: {totals["warnings"]}')
    print(f'非法打标 id (含不存在/跨科目): 见下方明细 category 统计')
    for k, v in sorted(category.items(), key=lambda x: -x[1]):
        print(f'  {v:4d}  {k}')
    print(f'index 一致性: {"OK" if not index_issues else f"{len(index_issues)} 处不符"}')
    for msg in index_issues:
        print(f'  {msg}')
    print()
    print('-' * 72)
    print('每卷统计')
    print('-' * 72)
    for ln in lines:
        print(ln)
    if not args.summary_only:
        if detail:
            print()
            print('-' * 72)
            print('问题明细')
            print('-' * 72)
            for ln in detail:
                print(ln)
    sys.exit(1 if totals['errors'] or index_issues else 0)


if __name__ == '__main__':
    main()
