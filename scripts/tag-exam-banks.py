#!/usr/bin/env python3
"""按题型规则给历年真题打标（章节/知识点/方法）：关键词索引匹配，置信度低的留空。

规则：
  1. 从三个 taxonomy 文件构建关键词索引（name + aliases，按词长优先）
  2. 每题按 subjectGuess 选科目词表，扫描题干：
     - 命中最长的 1-3 个知识点 -> knowledgePointIds（其 chapter_id 候选章节）
     - 命中最长的章节名 -> primaryChapterId（知识点章节作为 fallback）
     - 命中最长的 0-2 个方法 -> methodIds
  3. 符号规则增强：\\lim/\\int/矩阵/行列式/\\iint 等映射到章节兜底
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TAX = {
    "calculus": json.loads((ROOT / "data/calculus-taxonomy-v1.2.json").read_text(encoding="utf-8")),
    "linear_algebra": json.loads((ROOT / "data/linear-algebra-taxonomy-v1.json").read_text(encoding="utf-8")),
    "probability_statistics": json.loads((ROOT / "data/probability-taxonomy-v1.json").read_text(encoding="utf-8")),
}

STOPWORDS = {"计算", "求解", "证明", "问题", "应用", "方法", "概念", "性质", "公式", "判断", "求法"}


def build_index(tax: dict):
    """返回 (kp_index, method_index, chapter_index, kp_chapter)：
    词 -> [(词长, id)]；kp_chapter: kp_id -> chapter_id"""
    def collect(collection, aliases_prefix):
        index: dict[str, list] = {}
        chapter_of: dict[str, str] = {}
        for item in tax[collection]:
            words = set()
            name = re.sub(r"[（(].*?[)）]", "", item["name"])
            for w in re.split(r"[、/，,；：:与和的及]", name):
                w = w.strip()
                if len(w) >= 2 and w not in STOPWORDS:
                    words.add(w)
            for a in tax.get("aliases", {}).get(f"{aliases_prefix}{item['id']}", []):
                if len(a) >= 2:
                    words.add(a)
            for w in words:
                index.setdefault(w, []).append((len(w), item["id"]))
            if item.get("chapter_id"):
                chapter_of[item["id"]] = item["chapter_id"]
        return index, chapter_of

    kp_index, kp_chapter = collect("knowledge_points", "knowledge.")
    mt_index, _ = collect("methods", "method.")
    ch_index: dict[str, list] = {}
    for ch in tax["chapters"]:
        name = re.sub(r"[（(].*?[)）]", "", ch["name"])
        for w in re.split(r"[、/，,；：:与和的及]", name):
            w = w.strip()
            if len(w) >= 2 and w not in STOPWORDS:
                ch_index.setdefault(w, []).append((len(w), ch["id"]))
    # 排序保证长词优先命中
    for idx in (kp_index, mt_index, ch_index):
        for w in idx:
            idx[w].sort(reverse=True)
    return kp_index, mt_index, ch_index, kp_chapter


INDICES = {s: build_index(t) for s, t in TAX.items()}

SYMBOL_RULES = {
    "calculus": [
        (r"\\iint|\\iiint|二重积分|三重积分", "multiple_integral"),
        (r"\\lim|极限|无穷小|渐近线", "function_limit_continuity"),
        (r"\\int|积分", "one_variable_integral"),
        (r"级数|收敛|发散", "infinite_series"),
        (r"微分方程|通解|特征方程", "differential_equation"),
        (r"导数|单调|极值|凹凸|拐点|切线|泰勒|Taylor|中值", "one_variable_differential"),
        (r"偏导|全微分|梯度|方向导数", "multivariable_differential"),
        (r"曲线积分|曲面积分|格林|高斯|斯托克斯|散度|旋度", "curve_surface_integral"),
    ],
    "linear_algebra": [
        (r"行列式|克拉默|Cramer", "la.chapter.determinants"),
        (r"矩阵|逆矩阵|伴随|秩|初等变换|相似|特征值|特征向量|对角化", "la.chapter.matrices"),
        (r"线性相关|线性无关|向量组|线性表示|极大无关|内积|正交|基|维数|解空间", "la.chapter.vectors"),
        (r"线性方程组|通解|基础解系|增广矩阵", "la.chapter.linear_systems"),
        (r"特征值|特征向量|相似对角化|实对称", "la.chapter.eigenvalues"),
        (r"二次型|正定|标准形|规范形|合同|惯性", "la.chapter.quadratic_forms"),
    ],
    "probability_statistics": [
        (r"概率|事件|古典|几何概型|独立|贝叶斯|全概率", "prob.chapter.random_events"),
        (r"分布|随机变量|期望|方差|密度|泊松|二项|均匀|正态|指数分布", "prob.chapter.random_variables"),
        (r"联合|边缘|条件分布|二维|协方差|相关系数", "prob.chapter.multidimensional_random_variables"),
        (r"期望|方差|标准差|矩|切比雪夫", "prob.chapter.numerical_characteristics"),
        (r"大数定律|中心极限", "prob.chapter.limit_theorems"),
        (r"样本|统计量|卡方|χ|t 分布|F 分布|分位数|抽样", "prob.chapter.mathematical_statistics"),
        (r"估计|最大似然|矩估计|置信", "prob.chapter.parameter_estimation"),
        (r"假设检验|显著性|两类错误|拒绝域", "prob.chapter.hypothesis_testing"),
    ],
}


def longest_hits(text: str, index: dict, limit: int, min_len: int = 2) -> list[str]:
    hits: dict[str, int] = {}
    for w, entries in index.items():
        if len(w) < min_len:
            continue
        if w in text:
            best = max(l for l, _ in entries)
            hits[entries[0][1]] = best
    ranked = sorted(hits.items(), key=lambda kv: -kv[1])
    return [pid for pid, _ in ranked[:limit]]


def tag_problem(problem: dict) -> dict:
    subject = problem.get("subjectGuess") or ""
    if subject not in TAX:
        return problem
    text = problem.get("questionText", "")
    kp_index, mt_index, ch_index, kp_chapter = INDICES[subject]

    kps = longest_hits(text, kp_index, 3)
    chapter = ""
    ch_hits = longest_hits(text, ch_index, 1, min_len=3)
    if ch_hits:
        chapter = ch_hits[0]
    if not chapter:
        for kp in kps:
            if kp in kp_chapter:
                chapter = kp_chapter[kp]
                break
    if not chapter:
        for pattern, cid in SYMBOL_RULES[subject]:
            if re.search(pattern, text):
                chapter = cid
                break
    methods = longest_hits(text, mt_index, 2, min_len=3)

    problem["primaryChapterId"] = chapter or problem.get("primaryChapterId", "")
    problem["knowledgePointIds"] = kps
    problem["methodIds"] = methods
    if chapter and not problem["notes"].endswith("已按规则打标"):
        problem["notes"] += "；已按规则打标"
    return problem


def main() -> None:
    stats = {"tagged": 0, "chapter": 0, "kp": 0, "total": 0}
    for path in sorted((ROOT / "data/banks/exams").glob("*/*.json")):
        bank = json.loads(path.read_text(encoding="utf-8"))
        if bank.get("format") != "mathlink-bank":
            continue
        for problem in bank["problems"]:
            stats["total"] += 1
            tag_problem(problem)
            if problem["primaryChapterId"]:
                stats["chapter"] += 1
            if problem["knowledgePointIds"]:
                stats["kp"] += 1
            if problem["primaryChapterId"] or problem["knowledgePointIds"]:
                stats["tagged"] += 1
        path.write_text(json.dumps(bank, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"共 {stats['total']} 题 | 章节命中 {stats['chapter']} | 知识点命中 {stats['kp']} | 至少一项 {stats['tagged']}")


if __name__ == "__main__":
    main()
