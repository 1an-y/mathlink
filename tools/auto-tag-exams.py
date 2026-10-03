#!/usr/bin/env python3
"""真题空白打标保守自动打标器。

原则：
1. 只处理 primaryProblemTypeId 为空 / knowledgePointIds 为空数组的题，绝不覆盖已有打标。
2. 每条规则必须命中明确强关键词才生效；多规则给出不同 primaryProblemTypeId（冲突）时放弃打 ptype（宁缺勿滥）。
3. 已知章的题：只允许打「与章匹配」的题型 / 知识点（taxonomy 中 chapter_id 必须与 primaryChapterId 一致），
   且规则科目必须与章前缀推导的科目一致（la.* → 线代，prob.* → 概率，其余 → 高数）。
4. 章为空的题：仅应用 level='A'（强关键词）规则，无法校验章匹配，故只依据强关键词打标，notes 中标注待人工复核。
5. 命中的题在 notes 末尾追加「；自动打标(规则)：<id列表>，待人工复核」（幂等：已有该标记不再追加）。

用法：
  python3 tools/auto-tag-exams.py --dry-run            # 只统计，不写文件
  python3 tools/auto-tag-exams.py                      # 正式写文件
  python3 tools/auto-tag-exams.py --show-unmatched 40  # 附带打印每章未命中样例（校准用）
"""
from __future__ import annotations

import argparse
import collections
import glob
import json
import os
import re
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXAM_GLOB = os.path.join(REPO_ROOT, "data", "banks", "exams", "math*", "*.json")
TAXONOMY_FILES = [
    os.path.join(REPO_ROOT, "data", "calculus-taxonomy-v1.2.json"),
    os.path.join(REPO_ROOT, "data", "linear-algebra-taxonomy-v1.json"),
    os.path.join(REPO_ROOT, "data", "probability-taxonomy-v1.json"),
]

NOTE_MARK = "自动打标(规则)"

# ---------------------------------------------------------------- taxonomy ---

PT_CHAPTER: dict[str, str] = {}   # problem_type id -> chapter_id
KP_CHAPTER: dict[str, str] = {}   # knowledge_point id -> chapter_id
PT_SUBJECT: dict[str, str] = {}
KP_SUBJECT: dict[str, str] = {}
SUBJECT_OF_CHAPTER_PREFIX = {"la.": "linear_algebra", "prob.": "probability_statistics"}


def load_taxonomies() -> None:
    for path in TAXONOMY_FILES:
        with open(path, encoding="utf-8") as f:
            t = json.load(f)
        subj = t["subject"]["id"]
        for pt in t["problem_types"]:
            PT_CHAPTER[pt["id"]] = pt["chapter_id"]
            PT_SUBJECT[pt["id"]] = subj
        for kp in t["knowledge_points"]:
            KP_CHAPTER[kp["id"]] = kp["chapter_id"]
            KP_SUBJECT[kp["id"]] = subj


def chapter_subject(chapter_id: str) -> str:
    if chapter_id.startswith("la."):
        return "linear_algebra"
    if chapter_id.startswith("prob."):
        return "probability_statistics"
    return "calculus"


# ------------------------------------------------------------------ rules ---
# 每条规则字段：
#   name   规则名（统计用）
#   sub    科目：calculus / linear_algebra / probability_statistics（已知章的题做科目门禁）
#   lvl    'A' 强关键词规则（空章节题也可用）；'B' 需已知章配合门禁才允许
#   any    至少命中一个（正则，作用于 questionText）
#   all    可选，必须全部命中
#   none   可选，命中任一则本规则作废（排除歧义）
#   pt     可选，唯一确定的 problem_type id
#   kps    可选，知识点 id 列表
R = []


def rule(name, sub, lvl, any_, all_=(), none_=(), pt=None, kps=(), sig=()):
    R.append({
        "name": name, "sub": sub, "lvl": lvl,
        "any": [re.compile(p) for p in any_],
        "all": [re.compile(p) for p in all_],
        "none": [re.compile(p) for p in none_],
        "sig": [re.compile(p) for p in sig],
        "pt": pt, "kps": list(kps),
    })


def build_rules() -> None:
    # ================= 高数：函数、极限与连续 =================
    rule("f渐近线", "calculus", "A", [r"渐近线"], kps=["asymptote"])
    rule("f数列极限", "calculus", "A",
         [r"数列.{0,8}极限", r"\\lim\s*[_{ ]{0,3}\{?n", r"\\?\{\s*x_n\\?\}", r"\\?\{\s*a_n\\?\}",
          r"x_\{?n\+1\}", r"a_\{?n\+1\}"],
         none_=[r"级数", r"\\sum", r"方程组", r"相切"], pt="sequence_limit")
    rule("f函数极限", "calculus", "A",
         [r"\\lim\s*[_{ ]{0,4}\{?x", r"lim\s*_\{?x", r"极限\s*lim", r"x\\to"],
         none_=[r"\\?\{\s*x_n\\?\}", r"\\?\{\s*a_n\\?\}", r"x_\{?n\+?1\}?", r"数列"],
         pt="function_limit")
    rule("f函数极限软", "calculus", "B", [r"极限"], none_=[r"数列", r"级数", r"间断", r"连续性"],
         pt="function_limit")
    rule("f极限存在性", "calculus", "A",
         [r"极限是否存在", r"极限是否收敛", r"是否存在.{0,6}极限"], pt="limit_existence")
    rule("f极限证明", "calculus", "A", [r"极限.*证明", r"证明.*极限"], none_=[r"数列"], pt="limit_proof")
    rule("f间断点", "calculus", "A", [r"间断点", r"间断"], pt="continuity_and_discontinuity",
         kps=["discontinuity"])
    rule("f连续性", "calculus", "B", [r"连续性"], none_=[r"间断"], kps=["continuity"])
    rule("f等价无穷小", "calculus", "A", [r"等价无穷小"], kps=["equivalent_infinitesimal"])
    rule("f无穷小阶比较", "calculus", "A", [r"无穷小.{0,6}阶", r"阶.{0,4}比较", r"同阶", r"高阶.{0,4}低阶"],
         kps=["infinitesimal_order"])
    rule("f无穷小", "calculus", "B", [r"无穷小"], none_=[r"等价无穷小"], kps=["infinite_and_infinitesimal"])
    rule("f参数极限", "calculus", "A",
         [r"等价无穷小", r"等价的无穷小", r"无穷小量"], all_=[r"常数|参数"],
         none_=[r"数列"], pt="parameter_limit")
    rule("f无穷小比较", "calculus", "B",
         [r"等价的无穷小", r"等价无穷小", r"无穷小量", r"阶最高", r"阶最低", r"无穷小的阶"],
         none_=[r"常数\s*[a-b]=|参数"],
         pt="function_limit")
    rule("f左右极限", "calculus", "A", [r"左右极限", r"左极限", r"右极限"], kps=["one_sided_limit"])
    rule("f重要极限", "calculus", "A", [r"重要极限"], kps=["important_limits"])
    rule("f未定式", "calculus", "A", [r"未定式"], kps=["indeterminate_form"])
    rule("f函数性质", "calculus", "A", [r"奇函数", r"偶函数", r"奇偶性", r"周期函数", r"周期性", r"有界性", r"有界"],
         none_=[r"傅里叶", r"Fourier", r"级数", r"极限", r"区域", r"积分", r"数列", r"单调有界"],
         pt="function_properties", kps=["function_properties"])
    rule("f定义域值域", "calculus", "A", [r"定义域", r"值域"],
         pt="function_properties", kps=["function_domain_range"])
    rule("f反函数复合", "calculus", "B", [r"反函数", r"复合函数"], kps=["inverse_composite_function"])

    # ================= 高数：一元函数微分学 =================
    rule("d极值最值", "calculus", "A",
         [r"极大值", r"极小值", r"极值点", r"的极值", r"最大值", r"最小值", r"极值"],
         none_=[r"f\s*\(\s*x\s*[,，]\s*y", r"f\s*\(\s*x\s*,\s*y", r"f\\left\s*\(\s*x\s*,\s*y",
                r"z\s*=\s*f", r"\\partial", r"偏导", r"中值", r"存在.{0,8}\\xi", r"存在.{0,8}ξ",
                r"多元", r"变力", r"质点", r"做功", r"阻力", r"引力", r"\(x\s*,\s*y\)", r"z\s*=\s*z",
                r"x_\{?1\}?.{0,4}x_\{?2\}?"],
         pt="monotonicity_extrema", kps=["extrema"])
    rule("d单调性", "calculus", "A", [r"单调性", r"单调区间", r"增减区间", r"单调增加", r"单调减少", r"单调递增", r"单调递减"],
         pt="monotonicity_extrema", kps=["monotonicity"])
    rule("d凹凸拐点", "calculus", "A", [r"凹凸", r"拐点"], pt="concavity_inflection",
         kps=["concavity_inflection"])
    rule("d中值定理强", "calculus", "A",
         [r"中值定理", r"罗尔", r"拉格朗日中值", r"柯西中值", r"费马定理"],
         pt="mean_value_theorem", kps=["mean_value_theorem"])
    rule("d中值定理xi", "calculus", "B",
         [r"存在.{0,12}(\\xi|ξ)", r"至少存在一点", r"使得.{0,20}(\\xi|ξ)"], all_=[r"证明|试证|证[：:]"],
         none_=[r"积分", r"级数", r"重积分"],
         pt="mean_value_theorem", kps=["mean_value_theorem"])
    rule("d泰勒公式", "calculus", "A", [r"泰勒", r"Taylor", r"麦克劳林"], kps=["taylor_formula"])
    rule("d微分dy", "calculus", "A",
         [r"处的?微分", r"微分\s*\\mathrm\{d\}y", r"\\mathrm\{d\}y\\right\|", r"\(\\mathrm\{d\}y\)"],
         pt="derivative_calculation")
    rule("d高阶导数", "calculus", "A",
         [r"高阶导数", r"f\s*\^\s*\{\s*\(\s*[2-9n]\s*\)\s*\}", r"f\^\{\([2-9n]\)\}",
          r"f\^\{\(n\)\}", r"[2-9n]\s*阶(导数|导数处)", r"\\frac\s*\{\s*d\s*\^\s*[2-9n]",
          r"\\frac\{d\^[2-9]y", r"d\^\{?[2-9]y\s*/\s*d\s*x\^\{?[2-9]", r"\\left\.\s*\\frac\s*\{\s*d\s*\^\s*\{?[2-9]"],
         pt="higher_derivative")
    rule("d分段可导", "calculus", "B",
         [r"分段函数", r"分段", r"可导性", r"不可导", r"左右导数", r"连续且可导", r"连续但不可导"],
         pt="piecewise_derivative")
    rule("d可导可微连续", "calculus", "B", [r"可导", r"可微"], all_=[r"连续"],
         kps=["differentiability_continuity"])
    rule("d导数定义", "calculus", "A", [r"导数的定义", r"导数定义", r"按定义", r"用定义", r"定义.{0,6}导数"],
         kps=["derivative_definition"])
    rule("d导数计算", "calculus", "B",
         [r"求.{0,15}导数", r"求.{0,8}微分", r"\\frac\s*\{\s*d\s*y\s*\}\s*\{\s*d\s*x", r"dy\s*/\s*dx",
          r"y\s*'\s*=", r"d\s*y\s*/\s*d"],
         pt="derivative_calculation")
    rule("d隐函数求导", "calculus", "A", [r"隐函数", r"由方程.{0,14}确定", r"所确定的函数", r"确定\s*y\s*=\s*y\s*\(\s*x\s*\)"],
         pt="derivative_calculation", kps=["implicit_derivative"])
    rule("d参数方程求导", "calculus", "A",
         [r"参数方程", r"\\begin\s*\{\s*cases?\s*\}\s*x\s*=",
          r"\\begin\s*\{\s*array\s*\}\s*\{\s*l\s*\}\s*x\s*=",
          r"由参数\s*.{{0,8}}确定", r"参数.{0,8}确定"],
         pt="derivative_calculation", kps=["parametric_derivative"])
    rule("d反函数求导", "calculus", "B", [r"反函数"], all_=[r"导数|求导|'"], kps=["inverse_derivative"])
    rule("d相关变化率", "calculus", "B", [r"相关变化率"], kps=["related_rates"])
    rule("d曲率", "calculus", "A", [r"曲率"], kps=["curvature"])
    rule("d不等式证明", "calculus", "A", [r"不等式"], all_=[r"证明|试证|证[：:]"],
         none_=[r"积分", r"级数", r"中值"], pt="inequality_proof")
    rule("d不等式证明式", "calculus", "B",
         [r">\\?frac", r">\s*\\frac", r">\\d", r">\s*\\d?\("], all_=[r"证明|试证|证[：:]"],
         none_=[r"积分", r"级数", r"中值", r"方程组", r"行列式"],
         pt="inequality_proof")
    rule("d方程根", "calculus", "A",
         [r"根的个数", r"几个实根", r"几个不同的根", r"实根", r"方程.{0,10}恰有", r"唯一正根", r"只有.{0,4}实根",
          r"方程.{0,8}有几个", r"方程.{0,8}根的", r"零点"],
         none_=[r"随机变量", r"概率", r"分布"],
         pt="equation_root")

    # ================= 高数：一元函数积分学 =================
    rule("i不定积分", "calculus", "A", [r"不定积分"],
         pt="indefinite_integral", kps=["indefinite_integral_formulas"])
    rule("i定积分", "calculus", "B",
         [r"定积分", r"\\int\s*_\s*\{?[-0-9a-zA-Z\\]"],
         none_=[r"反常积分", r"广义积分", r"[fF]\s*\(\s*x\s*\)\s*=\s*\\int",
                r"\\mathrm\{d\}\}\s*\{\s*\\mathrm\{d\}x\s*\}\s*\\int",
                r"置信", r"假设检验", r"显著性", r"\^\s*\{?\s*\+?\\?infty", r"_\s*\{?\s*-?\\?infty",
                r"\\int\s*_\s*\{?\s*0\s*\}?\s*\^\s*\{?\s*x\b", r"不定积分"],
         pt="definite_integral")
    rule("i不定积分式", "calculus", "B",
         [r"\\int\s*[^_\^\{]{0,40}\\mathrm\s*\{\s*d\s*\}\s*\{?x|\\int\s*[^_^]{0,40}\bd\s*x\b"],
         none_=[r"定积分", r"变上限", r"\\int\s*_", r"\\int\s*\^"],
         pt="indefinite_integral", kps=["indefinite_integral_formulas"])
    rule("i变上限积分", "calculus", "A",
         [r"变上限积分", r"变限积分", r"变上限定积分"],
         pt="integral_defined_function", kps=["variable_upper_integral"])
    rule("i变上限积分式", "calculus", "B",
         [r"\\int\s*_\s*\{?\s*[a0-9]\s*\}?\s*\^?\s*\{?\s*x"],
         none_=[r"\\infty", r"曲线积分"],
         pt="integral_defined_function", kps=["variable_upper_integral"])
    rule("i反常积分", "calculus", "A", [r"反常积分", r"广义积分"], pt="improper_integral",
         kps=["improper_integral_definition"])
    rule("i反常积分式", "calculus", "A",
         [r"\\int\s*[_^]\s*\{?\s*[-+]?[0-9a-z]*\\}?\s*[\\^_]?\s*\{?\s*\+?\\?infty",
          r"\\int\s*[_^]\s*\{?\s*\+?\\?infty"],
         all_=[r"\\int"],
         none_=[r"样本", r"总体", r"正态分布", r"\\Phi", r"\\sum"],
         pt="improper_integral")
    rule("i无穷区间反常", "calculus", "B", [r"\\int"], all_=[r"\\infty"],
         none_=[r"\\Phi", r"正态", r"泊松"], kps=["infinite_interval_integral"])
    rule("i无界函数反常", "calculus", "B", [r"瑕点", r"无界"], kps=["unbounded_function_integral"])
    rule("i分段积分", "calculus", "B", [r"分段函数", r"分段"], kps=["piecewise_integral"])
    rule("i积分中值", "calculus", "A", [r"积分中值", r"积分.{0,6}中值定理"], kps=["integral_mean_value"])
    rule("i几何应用", "calculus", "A",
         [r"旋转体", r"绕.{0,8}旋转", r"旋转一周", r"弧长",
          r"所围成.{0,10}(平面图形的?|图形的?)?面积", r"图形的面积", r"曲线.{0,16}面积", r"的面积",
          r"的全长", r"周长"],
         all_=[r"\\int|积分|面积|曲线|弧长"],
         none_=[r"\\iint", r"\\iiint", r"二重积分", r"三重积分", r"曲线积分", r"曲面积分",
                r"概率", r"随机", r"掷", r"存在.{0,12}(\\xi|ξ)"],
         pt="integral_application_geometry", kps=["area_volume_arc"])
    rule("i物理应用", "calculus", "A",
         [r"做功", r"阻力", r"引力", r"压力", r"细棒", r"抽水", r"水压力", r"质心", r"形心",
          r"贮油罐", r"变力", r"质量.{0,12}(计算|多少|求)"],
         none_=[r"\\iint", r"\\iiint", r"二重积分", r"三重积分", r"随机变量", r"样本"],
         pt="physical_applications_of_integral", kps=["integral_physical_applications"])
    rule("i积分等式不等式", "calculus", "A", [r"积分.{0,8}不等式", r"不等式.{0,8}积分", r"积分等式"],
         all_=[r"证明|试证|证[：:]"], pt="integral_equality_inequality")
    rule("i原函数", "calculus", "B", [r"原函数"], none_=[r"变上限"],
         pt="indefinite_integral", kps=["indefinite_integral_formulas"])
    rule("i平均值", "calculus", "A", [r"平均值"], all_=[r"\\int|函数"], pt="definite_integral",
         kps=["definite_integral_properties"])

    # ================= 高数：向量代数与空间解析几何 =================
    rule("v平面方程", "calculus", "A", [r"平面.{0,10}方程", r"求.{0,10}平面", r"法向量"],
         none_=[r"投影", r"积分", r"旋转"], pt="plane_equation")
    rule("v直线方程", "calculus", "A", [r"直线.{0,10}方程", r"求.{0,10}直线"],
         none_=[r"绕.{0,6}直线.{0,6}旋转", r"旋转"], pt="line_equation")
    rule("v点线面位置", "calculus", "A", [r"夹角", r"距离"], all_=[r"平面|直线|点"],
         pt="point_line_plane_position", kps=["plane_line_position_relation"])
    rule("v垂直平行", "calculus", "B", [r"垂直|平行"], all_=[r"向量|直线|平面"],
         kps=["vector_perpendicular_parallel"])
    rule("v数量积", "calculus", "A", [r"数量积", r"点积"],
         pt="vector_operations", kps=["vector_scalar_product"])
    rule("v向量积", "calculus", "A", [r"向量积", r"叉积", r"法向量"],
         none_=[r"积分", r"旋转"], pt="vector_operations", kps=["vector_product"])
    rule("v混合积", "calculus", "A", [r"混合积"], pt="vector_operations", kps=["mixed_product"])
    rule("v夹角投影", "calculus", "B", [r"夹角", r"投影"], none_=[r"曲线", r"曲面"],
         kps=["vector_angle_projection"])
    rule("v方向余弦", "calculus", "A", [r"方向余弦"], kps=["direction_cosine"])
    rule("v旋转曲面", "calculus", "A", [r"旋转曲面", r"旋转.{0,10}所?得?的?曲面", r"曲线.{0,8}绕.{0,8}旋转"],
         none_=[r"积分", r"质点", r"\\iiint", r"\\iint"],
         pt="surface_equation_construction", kps=["rotating_surface"])
    rule("v柱面", "calculus", "A", [r"柱面"], kps=["cylindrical_surface"])
    rule("v二次曲面", "calculus", "A", [r"椭球", r"抛物面", r"双曲面", r"锥面", r"二次曲面"],
         none_=[r"积分", r"质点", r"变力"], pt="quadric_surface_recognition", kps=["quadric_surface_equations"])
    rule("v投影曲线", "calculus", "A", [r"投影曲线", r"投影方程", r"在.{0,8}面上的投影", r"在.{0,8}面上的投影曲线"],
         pt="projection_curve", kps=["projection_curve_equation"])
    rule("v球面", "calculus", "A", [r"球面"], all_=[r"方程|求"],
         none_=[r"积分", r"旋转", r"\\iiint", r"\\iint"],
         pt="surface_equation_construction", kps=["sphere_equation"])

    # ================= 高数：多元函数微分学 =================
    rule("m多元极值", "calculus", "A",
         [r"极值", r"最大值", r"最小值"],
         sig=[r"f\s*\(\s*x\s*[,，]\s*y", r"f\s*\(\s*x\s*,\s*y", r"f\\left\s*\(\s*x\s*[,，]\s*y",
              r"z\s*=\s*", r"\\partial", r"偏导", r"u\s*\(\s*x\s*,\s*y", r"二元函数"],
         none_=[r"条件极值", r"拉格朗日", r"\\partial", r"全微分", r"\\mathrm\{d\}z"],
         pt="multivariable_extrema")
    rule("m偏导计算A", "calculus", "A",
         [r"\\partial\s*\{?\s*[uvzwf]", r"\\frac\s*\{\s*\\partial[^}]*\}\s*\{\s*\\partial"],
         sig=[r"f\s*\(", r"z\s*=", r"u\s*=", r"v\s*=", r"\(x\s*[,，]\s*y"],
         none_=[r"微分方程", r"线性"],
         pt="partial_derivative_total_differential")
    rule("m条件极值", "calculus", "A", [r"条件极值", r"拉格朗日乘数"],
         pt="conditional_extrema")
    rule("m偏导全微分", "calculus", "B",
         [r"偏导数", r"\\frac\s*\{\s*\\partial", r"\\partial\s*z", r"\\partial\s*f", r"全微分"],
         pt="partial_derivative_total_differential")
    rule("m全微分", "calculus", "A", [r"全微分"], kps=["total_differential"])
    rule("m复合链式", "calculus", "B",
         [r"z\s*=\s*f\s*\(", r"z\s*=\s*f\\left", r"f\s*\(\s*[a-z]+\s*[,，]", r"复合函数", r"f\s*\(\s*u\s*,\s*v\s*\)"],
         kps=["composite_function_chain_rule"])
    rule("m隐函数", "calculus", "A", [r"隐函数", r"由方程.{0,14}确定", r"所确定"],
         kps=["implicit_function"])
    rule("m方向导数梯度", "calculus", "A", [r"梯度", r"grad", r"方向导数"],
         pt="directional_derivative_gradient", kps=["directional_derivative_gradient"])
    rule("m切平面法线", "calculus", "A", [r"切平面", r"法平面"],
         none_=[r"螺线", r"\\rho\s*=", r"极坐标", r"斜率"], kps=["geometric_applications_multivariable"])
    rule("m空间切线", "calculus", "A", [r"空间曲线.{0,10}切线", r"曲线.{0,10}切线.{0,10}平面", r"法平面"],
         none_=[r"斜率", r"螺线"], kps=["geometric_applications_multivariable"])
    rule("m多元极限连续", "calculus", "B", [r"二元函数.{0,10}极限", r"\\lim.{0,30}\(x\s*,\s*y\)", r"连续性", r"极限与连续"],
         kps=["multivariable_limit_continuity"])
    rule("m偏导存在性", "calculus", "B", [r"偏导数"], all_=[r"存在|连续"],
         none_=[r"求"], kps=["partial_derivative_existence"])
    rule("m二阶泰勒", "calculus", "A", [r"二阶泰勒", r"泰勒公式"], kps=["second_order_taylor_formula"])

    # ================= 高数：多元函数积分学 =================
    rule("g二重积分", "calculus", "A", [r"二重积分", r"\\iint"],
         none_=[r"曲线积分", r"曲面积分", r"\\oint", r"\\iiint"], pt="double_integral")
    rule("g三重积分", "calculus", "A", [r"三重积分", r"\\iiint"],
         none_=[r"曲面积分", r"\\iint"], pt="triple_integral")
    rule("g极坐标", "calculus", "A", [r"极坐标"], kps=["polar_coordinates"])
    rule("g积分次序", "calculus", "B", [r"交换.{0,8}次序", r"积分次序", r"改变.{0,8}次序", r"先.{0,10}后.{0,10}积分"],
         kps=["integration_order"])
    rule("g重积分对称性", "calculus", "B", [r"对称性", r"对称"], kps=["multiple_integral_symmetry"])
    rule("g柱面球坐标", "calculus", "A", [r"柱坐标", r"球坐标"], kps=["cylindrical_spherical_coordinates"])
    rule("g重积分应用", "calculus", "A", [r"质心", r"形心", r"转动惯量", r"重心"],
         all_=[r"二重积分|三重积分|\\iint|\\iiint|区域"],
         pt="multiple_integral_application")

    # ================= 高数：曲线与曲面积分 =================
    rule("c第一类曲线积分", "calculus", "A", [r"曲线积分"], all_=[r"\\mathrm\{d\}s|\\,?d\s?s\b|\\;ds|\bd s\b"],
         pt="line_integral_first_kind", kps=["line_integral_definition"])
    rule("c第一类曲线积分式", "calculus", "A",
         [r"\\oint"], all_=[r"\\mathrm\{d\}s|\\,?d\s?s\b|\bd\s?s\b"],
         none_=[r"曲面积分", r"\\Sigma"],
         pt="line_integral_first_kind")
    rule("c第二类曲线积分", "calculus", "A", [r"曲线积分", r"对坐标的曲线积分"],
         none_=[r"\\mathrm\{d\}s|\\,?d\s?s\b|\\;ds|\bd s\b"],
         pt="line_integral_second_kind")
    rule("c第二类曲线积分式", "calculus", "A",
         [r"\\oint", r"\\int_\s*\{?L"], all_=[r"\\mathrm\{d\}[xyz]|\\,?d\s?[xyz]"],
         none_=[r"曲面积分", r"\\Sigma", r"\\mathrm\{d\}s|\bd\s?s\b"],
         pt="line_integral_second_kind")
    rule("c格林公式", "calculus", "A", [r"格林", r"Green"], kps=["green_formula"])
    rule("c路径无关", "calculus", "A", [r"路径无关", r"与路径无关", r"无关于路径"],
         kps=["path_independence"], pt="line_integral_second_kind")
    rule("c保守场势函数", "calculus", "A", [r"势函数", r"保守场"], kps=["conservative_field_potential"])
    rule("c两类曲线积分", "calculus", "A", [r"两类曲线积分"], kps=["line_integral_relation"])
    rule("c第一类曲面积分", "calculus", "A", [r"曲面积分"], all_=[r"\\mathrm\{d\}S|\\,?d\s?S\b|\bd S\b"],
         pt="surface_integral_first_kind", kps=["surface_integral_definition"])
    rule("c第二类曲面积分", "calculus", "A", [r"曲面积分", r"对坐标的曲面积分"],
         none_=[r"\\mathrm\{d\}S|\\,?d\s?S\b|\bd S\b"],
         pt="surface_integral_second_kind")
    rule("c高斯公式", "calculus", "A", [r"高斯", r"Gauss"], kps=["gauss_formula"])
    rule("c斯托克斯", "calculus", "A", [r"Stokes", r"斯托克斯"], kps=["stokes_formula"])
    rule("c两类曲面积分", "calculus", "A", [r"两类曲面积分"], kps=["surface_integral_relation"])
    rule("c散度旋度", "calculus", "A", [r"散度", r"旋度", r"div\b", r"rot\b"],
         kps=["divergence_and_curl"])

    # ================= 高数：无穷级数 =================
    rule("s正项级数", "calculus", "A", [r"正项级数"], pt="positive_series_convergence")
    rule("s交错级数", "calculus", "A", [r"交错级数", r"莱布尼茨"],
         pt="alternating_general_series", kps=["alternating_series"])
    rule("s绝对条件收敛", "calculus", "A", [r"绝对收敛", r"条件收敛"],
         pt="alternating_general_series", kps=["absolute_conditional_convergence"])
    rule("s一般项级数", "calculus", "B", [r"级数"], all_=[r"敛散|收敛|发散"],
         none_=[r"正项级数", r"幂级数", r"傅里叶", r"Fourier"],
         pt="alternating_general_series")
    rule("s狄利克雷", "calculus", "A", [r"狄利克雷"], kps=["dirichlet_convergence_theorem"])
    rule("s幂级数收敛域", "calculus", "A", [r"收敛半径", r"收敛域", r"收敛区间"],
         all_=[r"幂级数|\\sum"], none_=[r"和函数"],
         pt="power_series_radius_domain", kps=["power_series_radius", "power_series_interval"])
    rule("s幂级数收敛域加和函数", "calculus", "A",
         [r"收敛域.{0,10}和函数", r"收敛域，并求其和函数", r"收敛域及和函数", r"收敛半径.{0,10}和函数"],
         pt="power_series_sum", kps=["power_series_sum", "power_series_interval"])
    rule("s幂级数求和", "calculus", "A", [r"和函数"], all_=[r"幂级数|级数|\\sum"],
         pt="power_series_sum", kps=["power_series_sum"])
    rule("s展开幂级数", "calculus", "A", [r"展开成.{0,8}幂级数", r"展开为.{0,8}幂级数", r"展开成.{0,6}级数"],
         pt="function_series_expansion", kps=["taylor_series"])
    rule("s傅里叶", "calculus", "A", [r"傅里叶", r"Fourier", r"a_\{?n\}?\s*\\?cos\s*n\s*x", r"\\sum.{0,40}a_\{?n\}?\s*\\?cos"],
         pt="fourier_series", kps=["fourier_series_coefficients"])
    rule("s正弦余弦级数", "calculus", "A", [r"正弦级数", r"余弦级数"], kps=["sine_cosine_series_expansion"])
    rule("s数值级数求和", "calculus", "A",
         [r"级数.{0,40}的和", r"求.{0,16}级数.{0,12}的?和"],
         all_=[r"\\sum|级数"],
         none_=[r"幂级数", r"和函数", r"敛散", r"收敛域"],
         pt="alternating_general_series")
    rule("s数项级数性质", "calculus", "B", [r"级数"], all_=[r"性质|部分和"],
         none_=[r"幂级数", r"傅里叶"], kps=["numeric_series_properties"])

    # ================= 高数：常微分方程 =================
    rule("o一阶线性", "calculus", "A", [r"一阶线性微分方程", r"一阶线性非齐次", r"一阶线性齐次", r"一阶微分方程"],
         pt="first_order_differential_equation", kps=["first_order_linear_equation"])
    rule("o可分离变量", "calculus", "A", [r"分离变量", r"可分离"], all_=[r"微分方程|方程"],
         pt="first_order_differential_equation", kps=["separable_equation"])
    rule("o齐次一阶", "calculus", "B", [r"齐次方程", r"齐次微分方程"], none_=[r"二阶|线性方程组|y\s*''"],
         pt="first_order_differential_equation", kps=["homogeneous_first_order_equation"])
    rule("o伯努利", "calculus", "A", [r"伯努利方程", r"Bernoulli方程", r"贝努利"],
         kps=["bernoulli_equation"])
    rule("o全微分方程", "calculus", "A", [r"全微分方程"], kps=["exact_differential_equation"])
    rule("o可降阶", "calculus", "A", [r"可降阶", r"降阶"],
         pt="reducible_higher_order_equation", kps=["reducible_higher_order_equation"])
    rule("o二阶线性", "calculus", "A", [r"二阶", r"高阶", r"[a-zA-Z]\s*''",
          r"[a-zA-Z]\^\{?\\?prime\s*\\?prime", r"[a-zA-Z]\^\{\\prime\\prime\}", r"\\prime\s*\\prime"],
         all_=[r"微分方程|方程|通解"],
         none_=[r"差分"],
         pt="linear_higher_order_equation")
    rule("o二阶齐次", "calculus", "B", [r"齐次"], all_=[r"二阶|高阶", r"微分方程|方程"], none_=[r"非齐次|线性方程组"],
         kps=["second_order_homogeneous_linear"])
    rule("o二阶非齐次", "calculus", "B", [r"非齐次"], all_=[r"二阶|高阶|y\s*''", r"微分方程|方程"],
         none_=[r"线性方程组"], kps=["second_order_nonhomogeneous_linear"])
    rule("o特征方程", "calculus", "A", [r"特征方程", r"特征根"], kps=["characteristic_equation"])
    rule("o欧拉方程", "calculus", "A", [r"欧拉方程"], kps=["euler_equation"])
    rule("o差分方程", "calculus", "A", [r"差分方程", r"熟练工", r"人数.{0,16}统计", r"递推"],
         pt="difference_equation", kps=["first_order_linear_difference_equation"])
    rule("o一阶通用", "calculus", "B", [r"[a-zA-Z]\s*'", r"[a-zA-Z]\^\s*\\?\{?\s*\\?prime", r"\\frac\s*\{\s*d\s*[a-z]\s*\}\s*\{\s*d\s*[a-z]\s*\}"], all_=[r"微分方程|通解|特解"],
         none_=[r"[a-zA-Z]\s*''", r"prime\s*\\?prime", r"二阶", r"高阶", r"\\frac\s*\{\s*d\s*y\s*\}\s*\{\s*d\s*t"],
         pt="first_order_differential_equation")

    # ================= 线代：行列式 =================
    rule("L行列式计算", "linear_algebra", "B", [r"行列式"], all_=[r"求|=|计算|值"],
         none_=[r"代数余子式", r"证明"],
         pt="la.problem_type.determinant_computation")
    rule("L抽象行列式", "linear_algebra", "B", [r"行列式"], all_=[r"证明|试证"],
         pt="la.problem_type.abstract_determinant")
    rule("L代数余子式", "linear_algebra", "A", [r"代数余子式", r"余子式"],
         pt="la.problem_type.cofactor_sum", kps=["la.knowledge.cofactor"])
    rule("L展开定理", "linear_algebra", "B", [r"按行展开", r"按列展开", r"展开定理"],
         kps=["la.knowledge.row_column_expansion"])
    rule("L克拉默", "linear_algebra", "A", [r"克拉默", r"Cramer"],
         pt="la.problem_type.cramer_rule", kps=["la.knowledge.cramer_rule"])

    # ================= 线代：矩阵 =================
    rule("L逆矩阵", "linear_algebra", "A", [r"逆矩阵", r"可逆", r"\^\{-1\}"],
         none_=[r"特征值", r"特征向量", r"相似", r"伴随矩阵", r"偏导", r"\\partial", r"极值"],
         pt="la.problem_type.inverse_matrix", kps=["la.knowledge.inverse_matrix"])
    rule("L伴随矩阵", "linear_algebra", "A", [r"伴随矩阵", r"A\s*\^\s*\{?\*"],
         none_=[r"特征值", r"特征向量"],
         pt="la.problem_type.adjoint_matrix", kps=["la.knowledge.adjoint_matrix"])
    rule("L矩阵的秩", "linear_algebra", "A", [r"秩"], none_=[r"二次型", r"向量组", r"正定", r"公共解", r"同解"],
         pt="la.problem_type.matrix_rank", kps=["la.knowledge.matrix_rank"])
    rule("L初等变换", "linear_algebra", "A", [r"初等变换", r"初等矩阵"],
         pt="la.problem_type.elementary_matrix_problem",
         kps=["la.knowledge.elementary_transformation", "la.knowledge.elementary_matrix"])
    rule("L方阵的幂", "linear_algebra", "A", [r"A\s*\^\s*\{?\s*n", r"A\^n", r"方阵的幂", r"A\s*\^\s*\{?k"],
         pt="la.problem_type.matrix_power", kps=["la.knowledge.matrix_power"])
    rule("L矩阵多项式", "linear_algebra", "A", [r"f\s*\(\s*A\s*\)", r"f\\left\(\s*A", r"g\s*\(\s*A\s*\)",
          r"A\s*\^\s*\{?2\}?\s*[-+]", r"A\s*\^\s*\{?2\}?\s*[-−]"],
         none_=[r"逆矩阵", r"\^\{-1\}"],
         pt="la.problem_type.matrix_polynomial")
    rule("L矩阵方程", "linear_algebra", "A", [r"矩阵方程"], pt="la.problem_type.matrix_equation")
    rule("L矩阵方程式", "linear_algebra", "A",
         [r"A\s*\}?\s*P\s*\}?\s*=\s*(\\mathbf\{)?\s*P", r"P\s*\^\s*\{?\s*-1\s*\}?\s*A\s*P",
          r"A\s*X\s*=\s*X\s*B", r"X\s*=\s*A\s*X\s*\+\s*B"],
         none_=[r"特征值", r"特征向量", r"方程组", r"微分方程", r"初等", r"第\s*\d+\s*[行列]"],
         pt="la.problem_type.matrix_equation")
    rule("L分块矩阵", "linear_algebra", "A", [r"分块矩阵", r"分块", r"\(\s*X\s*,\s*Y\s*\)"],
         none_=[r"秩", r"r\("],
         pt="la.problem_type.block_matrix", kps=["la.knowledge.block_matrix"])
    rule("L对称矩阵", "linear_algebra", "A", [r"对称矩阵", r"反对称"],
         kps=["la.knowledge.symmetric_matrix"])
    rule("L矩阵运算", "linear_algebra", "B", [r"求.{0,10}A\s*B", r"求.{0,10}B\s*A", r"A\s*B\s*="],
         none_=[r"方程组", r"通解", r"秩", r"r\("], pt="la.problem_type.matrix_operation")

    # ================= 线代：向量 =================
    rule("L线性表示", "linear_algebra", "A", [r"线性表示", r"线性表出", r"能否表示", r"表示为.{0,6}组合"],
         all_=[r"向量组|向量|\\alpha|α"],
         none_=[r"特征向量", r"特征值", r"函数", r"微分方程", r"极大无关组", r"极大线性无关组"],
         pt="la.problem_type.linear_representation", kps=["la.knowledge.linear_combination"])
    rule("L线性相关无关", "linear_algebra", "A", [r"线性相关", r"线性无关"],
         none_=[r"能否", r"线性表示", r"表出", r"函数", r"微分方程", r"特征向量",
                r"极大无关组", r"极大线性无关组", r"方程组", r"[xX]\s*=\s*b"],
         pt="la.problem_type.linear_independence", kps=["la.knowledge.linear_correlation"])
    rule("L相关性判定", "linear_algebra", "B", [r"线性无关"], all_=[r"充分必要|充要|判定"],
         kps=["la.knowledge.correlation_criteria"])
    rule("L极大无关组", "linear_algebra", "A", [r"极大线性无关组", r"极大无关组"],
         pt="la.problem_type.maximal_independent_group", kps=["la.knowledge.maximal_independent_group"])
    rule("L向量组的秩", "linear_algebra", "A", [r"向量组的秩", r"等价向量组", r"向量组.{0,8}等价"],
         pt="la.problem_type.vector_group_rank",
         kps=["la.knowledge.vector_group_rank", "la.knowledge.equivalent_vector_groups"])
    rule("L正交规范化", "linear_algebra", "A", [r"施密特", r"正交规范化", r"规范正交", r"标准正交"],
         pt="la.problem_type.orthogonalization", kps=["la.knowledge.schmidt_orthogonalization"])
    rule("L正交矩阵", "linear_algebra", "A", [r"正交矩阵"],
         none_=[r"对角化", r"相似", r"实对称", r"二次型"],
         pt="la.problem_type.orthogonal_matrix", kps=["la.knowledge.orthogonal_matrix"])
    rule("L内积", "linear_algebra", "B", [r"内积"],
         pt="la.problem_type.inner_product_orthogonality", kps=["la.knowledge.inner_product"])
    rule("L向量空间", "linear_algebra", "A", [r"向量空间", r"线性空间", r"基.{0,4}维数", r"基与坐标"],
         none_=[r"过渡矩阵", r"基变换", r"到基", r"由基"],
         pt="la.problem_type.vector_space_basis_dimension",
         kps=["la.knowledge.vector_space", "la.knowledge.basis_dimension_coordinates"])
    rule("L基变换过渡矩阵", "linear_algebra", "A", [r"过渡矩阵", r"基变换", r"坐标变换"],
         none_=[r"极坐标"],
         pt="la.problem_type.change_of_basis_coordinates",
         kps=["la.knowledge.transition_matrix", "la.knowledge.change_of_basis_coordinates"])

    # ================= 线代：线性方程组 =================
    rule("L齐次方程组", "linear_algebra", "A",
         [r"齐次线性方程组", r"齐次方程组", r"齐次线性方程", r"\\mathbf\{?[Aa]\}?\\mathbf\{?x\}?\s*=\s*\\mathbf\{?0",
          r"A\\?mathbf\{x\}\s*=\s*0", r"A[xX]\s*=\s*0"],
         none_=[r"微分方程", r"差分", r"公共解", r"同解", r"非齐次", r"实对称", r"正交矩阵", r"对角化"],
         pt="la.problem_type.homogeneous_system")
    rule("L基础解系", "linear_algebra", "A", [r"基础解系"], kps=["la.knowledge.basic_solution_system"])
    rule("L通解结构", "linear_algebra", "A", [r"通解"], all_=[r"方程组"],
         kps=["la.knowledge.general_solution"])
    rule("L非齐次方程组", "linear_algebra", "A", [r"非齐次线性方程组", r"非齐次方程组", r"非齐次线性"],
         none_=[r"微分方程", r"差分", r"y\s*''", r"何值", r"取值"],
         pt="la.problem_type.nonhomogeneous_system", kps=["la.knowledge.nonhomogeneous_solvability"])
    rule("L含参方程组", "linear_algebra", "A", [r"何值", r"取值", r"讨论"], all_=[r"方程组"],
         none_=[r"微分方程", r"差分", r"二次型"],
         pt="la.problem_type.system_with_parameters")
    rule("L方程组通用", "linear_algebra", "B", [r"线性方程组", r"方程组", r"A\s*[xX]\s*=\s*b"],
         none_=[r"齐次", r"微分方程", r"差分", r"对角化", r"相似于", r"实对称", r"正交矩阵"],
         pt="la.problem_type.nonhomogeneous_system")
    rule("L公共解同解", "linear_algebra", "A", [r"公共解", r"同解"],
         pt="la.problem_type.common_solution", kps=["la.knowledge.common_same_solution"])
    rule("L解空间", "linear_algebra", "A", [r"解空间"],
         pt="la.problem_type.solution_space_problem", kps=["la.knowledge.solution_space"])
    rule("L消元法", "linear_algebra", "B", [r"消元", r"高斯消去"], kps=["la.knowledge.gaussian_elimination"])

    # ================= 线代：特征值与特征向量 =================
    rule("L相似对角化", "linear_algebra", "A", [r"对角化", r"对角形", r"对角矩阵", r"相似对角"],
         pt="la.problem_type.diagonalization", kps=["la.knowledge.diagonalization_criteria"])
    rule("L实对称正交", "linear_algebra", "A", [r"正交变换", r"求正交"], all_=[r"实对称|对称矩阵"],
         none_=[r"对角化", r"对角形", r"二次型|标准形"],
         pt="la.problem_type.real_symmetric_diagonalization", kps=["la.knowledge.real_symmetric_properties"])
    rule("L相似判断", "linear_algebra", "A", [r"相似"],
         none_=[r"对角化", r"对角形", r"二次型"],
         pt="la.problem_type.similarity_judgment", kps=["la.knowledge.similarity_concept"])
    rule("L特征值计算", "linear_algebra", "A", [r"特征值", r"特征向量"],
         none_=[r"对角化", r"对角形", r"标准形", r"正交变换"],
         pt="la.problem_type.eigenvalue_computation", kps=["la.knowledge.eigen_concept"])
    rule("L特征值性质", "linear_algebra", "B", [r"特征值", r"特征向量"], all_=[r"性质|证明|试证"],
         kps=["la.knowledge.eigen_properties"])
    rule("L由特征值反求", "linear_algebra", "B", [r"反求", r"由特征值"], all_=[r"特征值|特征向量"],
         pt="la.problem_type.eigen_parameter_matrix")

    # ================= 线代：二次型 =================
    rule("L正交变换标准形", "linear_algebra", "A", [r"正交变换"], all_=[r"二次型|标准形"],
         none_=[r"规范形", r"惯性"],
         pt="la.problem_type.orthogonal_standard_form", kps=["la.knowledge.orthogonal_standard_form"])
    rule("L配方法", "linear_algebra", "A", [r"配方法"], all_=[r"二次型|标准形"],
         pt="la.problem_type.completing_square_standard_form")
    rule("L规范形惯性", "linear_algebra", "A", [r"规范形", r"惯性", r"正惯性指数", r"负惯性指数"],
         all_=[r"二次型|标准形"],
         pt="la.problem_type.inertia_normal_form",
         kps=["la.knowledge.normal_form", "la.knowledge.inertia_theorem"])
    rule("L正定性", "linear_algebra", "A", [r"正定"],
         pt="la.problem_type.positive_definiteness",
         kps=["la.knowledge.positive_definite_concept", "la.knowledge.positive_definite_criteria"])
    rule("L二次型通用", "linear_algebra", "A", [r"二次型"],
         none_=[r"正交变换", r"配方法", r"规范形", r"惯性", r"标准形", r"正定"],
         pt="la.problem_type.quadratic_form_matrix", kps=["la.knowledge.quadratic_form_concept"])
    rule("L标准形", "linear_algebra", "A", [r"标准形"], all_=[r"二次型"],
         none_=[r"正交变换", r"配方法"],
         kps=["la.knowledge.standard_form"])
    rule("L合同", "linear_algebra", "A", [r"合同"], kps=["la.knowledge.contract"])

    # ================= 概率：随机事件和概率 =================
    rule("P古典概型", "probability_statistics", "A",
         [r"古典概型", r"等可能", r"掷", r"抛一枚", r"抛两枚", r"摸球", r"抽取.{0,6}产品", r"任取.{0,4}个"],
         none_=[r"再从", r"接着"],
         pt="prob.type.classical_probability", kps=["prob.knowledge.classical_probability"])
    rule("P几何概型", "probability_statistics", "A",
         [r"几何概型", r"区间.{0,12}随机", r"随机地?取一?点", r"随机地?投?掷?点", r"随机地取一数", r"随机取一?点",
          r"内掷一?点", r"随机地?向.{0,10}内掷"],
         pt="prob.type.geometric_probability", kps=["prob.knowledge.geometric_probability"])
    rule("P条件概率", "probability_statistics", "A",
         [r"条件概率", r"P\s*[({][^)}]{1,20}[|｜][^)}]{1,20}[)}]"],
         pt="prob.type.conditional_probability", kps=["prob.knowledge.conditional_probability_formula"])
    rule("P全概率贝叶斯", "probability_statistics", "A", [r"全概率", r"贝叶斯", r"Bayes"],
         pt="prob.type.total_probability_bayes")
    rule("P全概率公式", "probability_statistics", "A", [r"全概率"], kps=["prob.knowledge.total_probability_formula"])
    rule("P贝叶斯公式", "probability_statistics", "A", [r"贝叶斯", r"Bayes"], kps=["prob.knowledge.bayes_formula"])
    rule("P独立性", "probability_statistics", "A", [r"相互独立", r"独立性"],
         all_=[r"事件"], none_=[r"随机变量", r"样本"],
         pt="prob.type.event_independence_judgment", kps=["prob.knowledge.event_independence"])
    rule("P独立重复试验", "probability_statistics", "A",
         [r"独立重复试?验", r"伯努利试?验", r"至少出现一次", r"至少发生一次", r"至少有一次", r"独立地对同一目标"],
         pt="prob.type.bernoulli_trials", kps=["prob.knowledge.independent_repeated_trials"])
    rule("P事件关系", "probability_statistics", "B",
         [r"互不相容", r"对立事件", r"事件的运算", r"事件关系", r"A\s*[∪∪]\s*B", r"A\\cup B"],
         kps=["prob.knowledge.event_relations_operations"])

    # ================= 概率：一维随机变量 =================
    rule("P分布函数性质", "probability_statistics", "B", [r"分布函数"],
         none_=[r"联合", r"求.*概率密度", r"密度函数", r"概率密度", r"E\s*[\[(]", r"期望", r"方差", r"D\s*[\[(]"],
         pt="prob.type.distribution_function_properties", kps=["prob.knowledge.distribution_function"])
    rule("P分布律", "probability_statistics", "A", [r"分布律", r"概率分布为\s*\$?P?\s*\\?\{?\s*X"],
         none_=[r"联合", r"二维", r"令\s*[YZ]\s*=", r"分布律.{0,12}(和|及|与).{0,8}期望",
                r"E\s*[\[(]", r"期望", r"方差", r"D\s*[\[(]"],
         pt="prob.type.discrete_distribution_law", kps=["prob.knowledge.discrete_distribution"])
    rule("P分布律加期望", "probability_statistics", "A",
         [r"分布律.{0,12}(和|及|与).{0,8}(数学)?期望"],
         pt="prob.type.discrete_distribution_law",
         kps=["prob.knowledge.discrete_distribution", "prob.knowledge.mathematical_expectation"])
    rule("P概率密度", "probability_statistics", "A", [r"概率密度", r"密度函数"],
         none_=[r"联合", r"二维", r"\(X\s*[,，]\s*Y\)", r"令\s*[YZ]\s*=",
                r"[YZ]\s*=\s*[a-zA-Z\\(].{0,16}的?(概率密度|密度|分布)",
                r"E\s*[\[(]", r"D\s*[\[(]", r"期望", r"方差",
                r"矩估计", r"最大似然", r"极大似然"],
         pt="prob.type.continuous_density", kps=["prob.knowledge.continuous_density"])
    rule("P泊松分布", "probability_statistics", "A", [r"泊松", r"Poisson"],
         kps=["prob.knowledge.poisson_distribution"])
    rule("P泊松识别", "probability_statistics", "B", [r"k!"], all_=[r"P\s*\\\{|P\s*\{"],
         kps=["prob.knowledge.poisson_distribution"])
    rule("P二项分布", "probability_statistics", "A", [r"二项分布", r"B\s*\(\s*n\s*,", r"n\s*重伯努利"],
         kps=["prob.knowledge.binomial_distribution"])
    rule("P超几何分布", "probability_statistics", "A", [r"超几何"],
         kps=["prob.knowledge.hypergeometric_distribution"])
    rule("P均匀分布", "probability_statistics", "A", [r"均匀分布", r"服从.{0,10}均匀"],
         none_=[r"max", r"min", r"最大值", r"最小值", r"联合", r"二维", r"\(X\s*[,，]\s*Y\)",
                r"的概率密度", r"密度函数"],
         pt="prob.type.common_continuous_distributions", kps=["prob.knowledge.uniform_distribution"])
    rule("P指数分布", "probability_statistics", "A", [r"指数分布"],
         pt="prob.type.common_continuous_distributions", kps=["prob.knowledge.exponential_distribution"])
    rule("P正态分布", "probability_statistics", "A",
         [r"正态分布", r"N\s*\(\s*[-0-9\\]", r"标准正态", r"\\Phi\s*\("],
         all_=[r"P\s*\\\{|P\s*\{|求.{0,12}概率|概率为|\\Phi|分布函数"],
         none_=[r"样本", r"总体", r"估计", r"检验", r"置信", r"联合", r"二维",
                r"令\s*[YZ]\s*=", r"[YZ]\s*=\s*[a-zA-Z\\(].{0,16}的?(概率密度|密度|分布)"],
         pt="prob.type.normal_distribution_calculation", kps=["prob.knowledge.normal_distribution"])
    rule("P随机变量函数分布", "probability_statistics", "A",
         [r"令\s*[YZ]\s*=", r"[YZ]\s*=\s*[^,，。]{1,24}[，。]\s*求\s*[YZ]\s*的?(分布|概率密度|密度)",
          r"随机变量.{0,6}函数.{0,6}分布", r"求\s*[YZ]\s*=\s*[a-zA-Z\\(].{0,14}的?(分布|密度|概率密度)"],
         pt="prob.type.function_distribution", kps=["prob.knowledge.function_of_random_variable"])

    # ================= 概率：多维随机变量 =================
    rule("P二维离散联合", "probability_statistics", "A", [r"联合分布律", r"二维离散"],
         none_=[r"联合分布律.{0,24}边缘"],
         pt="prob.type.joint_discrete_distribution", kps=["prob.knowledge.joint_discrete_distribution"])
    rule("P联合加边缘分布律", "probability_statistics", "A",
         [r"联合分布律.{0,24}边缘分布律", r"边缘分布律.{0,24}联合分布律"],
         pt="prob.type.joint_discrete_distribution",
         kps=["prob.knowledge.joint_discrete_distribution", "prob.knowledge.marginal_distribution"])
    rule("P二维连续联合", "probability_statistics", "A", [r"联合概率密度", r"联合密度", r"二维连续"],
         pt="prob.type.joint_continuous_distribution", kps=["prob.knowledge.joint_continuous_distribution"])
    rule("P联合分布函数", "probability_statistics", "A", [r"联合分布函数"],
         kps=["prob.knowledge.joint_distribution_function"])
    rule("P联合分布", "probability_statistics", "A", [r"联合分布", r"二维随机变量", r"\(X\s*[,，]\s*Y\)"],
         none_=[r"联合分布律|二维离散|联合密度|联合概率密度|二维连续|边缘|条件分布"],
         kps=["prob.knowledge.joint_distribution_function"])
    rule("P边缘条件分布", "probability_statistics", "A", [r"边缘分布", r"条件分布"],
         pt="prob.type.marginal_conditional_distribution",
         kps=["prob.knowledge.marginal_distribution", "prob.knowledge.conditional_distribution"])
    rule("P随机变量独立性", "probability_statistics", "A",
         [r"是否独立", r"独立.{0,4}是否", r"(判断|证明|验证|试确定).{0,12}独立", r"独立性"],
         all_=[r"随机变量|联合|分布"], none_=[r"样本", r"重复试验", r"事件"],
         pt="prob.type.random_variables_independence", kps=["prob.knowledge.random_variables_independence"])
    rule("P二维均匀正态", "probability_statistics", "A", [r"二维均匀", r"二维正态"],
         pt="prob.type.bivariate_uniform_normal",
         kps=["prob.knowledge.bivariate_uniform_distribution", "prob.knowledge.bivariate_normal_distribution"])
    rule("P最大最小分布", "probability_statistics", "A",
         [r"max\s*\\?\{", r"min\s*\\?\{", r"最大值.{0,6}的?分布", r"最小值.{0,6}的?分布", r"最大值.{0,4}小于"],
         pt="prob.type.max_min_distribution", kps=["prob.knowledge.functions_of_random_variables"])
    rule("P两变量函数分布", "probability_statistics", "A",
         [r"[ZU]\s*=\s*[XY]\s*\+", r"两个随机变量.{0,6}函数", r"[ZU]\s*=\s*[XY]\s*[-//]"],
         pt="prob.type.function_of_two_variables", kps=["prob.knowledge.functions_of_random_variables"])

    # ================= 概率：数字特征 =================
    rule("P期望", "probability_statistics", "A", [r"数学期望", r"期望", r"E\s*[\[(]\s*X", r"E\(X"],
         none_=[r"均值为", r"期望为"],
         pt="prob.type.expectation_calculation", kps=["prob.knowledge.mathematical_expectation"])
    rule("P期望加方差", "probability_statistics", "A",
         [r"(数学)?期望.{0,12}(和|及|与).{0,6}方差", r"期望和方差", r"方差和期望", r"期望与方差", r"期望及方差"],
         pt="prob.type.expectation_calculation",
         kps=["prob.knowledge.mathematical_expectation", "prob.knowledge.variance"])
    rule("P方差", "probability_statistics", "A", [r"方差", r"标准差", r"D\s*[\[(]\s*X", r"D\(X"],
         none_=[r"方差为", r"标准差为", r"均值为", r"协方差", r"相关系数"],
         pt="prob.type.variance_calculation", kps=["prob.knowledge.variance"])
    rule("P协方差", "probability_statistics", "A", [r"协方差", r"Cov", r"cov\s*\("],
         pt="prob.type.covariance_correlation", kps=["prob.knowledge.covariance"])
    rule("P相关系数", "probability_statistics", "A", [r"相关系数", r"\\rho", r"不相关"],
         none_=[r"E\s*\[\s*X\s*\("],
         pt="prob.type.covariance_correlation", kps=["prob.knowledge.correlation_coefficient"])
    rule("P矩", "probability_statistics", "A", [r"原点矩", r"中心矩", r"[二三四五]阶矩"],
         pt="prob.type.moments_calculation", kps=["prob.knowledge.moments"])
    rule("P数字特征性质", "probability_statistics", "B", [r"E\s*[\[(]|D\s*[\[(]"], all_=[r"性质"],
         pt="prob.type.numerical_properties_application")
    rule("P数字特征性质A", "probability_statistics", "A",
         [r"E\s*\[\s*X\s*\("], all_=[r"E\s*[\[(]"],
         none_=[r"样本", r"总体", r"估计", r"检验", r"相关系数"],
         pt="prob.type.numerical_properties_application",
         kps=["prob.knowledge.expectation_variance_properties"])
    rule("P常见分布数字特征", "probability_statistics", "B",
         [r"期望|方差"], all_=[r"泊松|二项|均匀|指数|正态"],
         none_=[r"样本", r"总体", r"估计", r"检验"],
         kps=["prob.knowledge.common_distribution_numerical_features"])
    rule("P切比雪夫不等式", "probability_statistics", "A", [r"切比雪夫"],
         pt="prob.type.chebyshev_inequality_application", kps=["prob.knowledge.chebyshev_inequality"])

    # ================= 概率：大数定律与中心极限定理 =================
    rule("P大数定律", "probability_statistics", "A", [r"大数定律"],
         pt="prob.type.law_of_large_numbers")
    rule("P切比雪夫大数定律", "probability_statistics", "A", [r"切比雪夫大数定律"],
         kps=["prob.knowledge.chebyshev_law_large_numbers"])
    rule("P伯努利大数定律", "probability_statistics", "A", [r"伯努利大数定律"],
         kps=["prob.knowledge.bernoulli_law_large_numbers"])
    rule("P辛钦大数定律", "probability_statistics", "A", [r"辛钦"],
         kps=["prob.knowledge.khinchine_law_large_numbers"])
    rule("P中心极限定理", "probability_statistics", "A", [r"中心极限"],
         pt="prob.type.central_limit_theorem_application",
         kps=["prob.knowledge.levy_lindberg_theorem", "prob.knowledge.de_moivre_laplace_theorem"])
    rule("P依概率收敛", "probability_statistics", "A", [r"依概率收敛"],
         pt="prob.type.convergence_in_probability", kps=["prob.knowledge.convergence_in_probability"])

    # ================= 概率：数理统计基本概念 =================
    rule("P样本均值方差", "probability_statistics", "A", [r"样本均值", r"样本方差", r"\\overline\s*\{?\s*X"],
         none_=[r"正态总体"],
         pt="prob.type.sample_mean_variance", kps=["prob.knowledge.sample_mean_variance"])
    rule("P统计量", "probability_statistics", "A", [r"统计量"],
         none_=[r"样本均值", r"样本方差"],
         pt="prob.type.statistic_distribution", kps=["prob.knowledge.statistic"])
    rule("P三大分布", "probability_statistics", "A", [r"t\s*分布", r"\\chi\s*\^", r"\\chi\^", r"F\s*分布", r"卡方", r"χ\^?2?"],
         pt="prob.type.three_sampling_distributions")
    rule("P卡方分布kp", "probability_statistics", "A", [r"\\chi\s*\^", r"卡方", r"χ"],
         kps=["prob.knowledge.chi_square_distribution"])
    rule("Pt分布kp", "probability_statistics", "A", [r"t\s*分布"], kps=["prob.knowledge.t_distribution"])
    rule("PF分布kp", "probability_statistics", "A", [r"F\s*分布"], kps=["prob.knowledge.f_distribution"])
    rule("P分位数", "probability_statistics", "A", [r"分位数", r"分位点"],
         pt="prob.type.quantile", kps=["prob.knowledge.quantiles"])
    rule("P正态总体抽样", "probability_statistics", "A", [r"正态总体"],
         pt="prob.type.normal_sampling_distribution",
         kps=["prob.knowledge.normal_population_sampling_distribution"])

    # ================= 概率：参数估计 =================
    rule("P矩估计", "probability_statistics", "A", [r"矩估计"],
         none_=[r"(最大|极大)似然"],
         pt="prob.type.moment_estimation", kps=["prob.knowledge.moment_estimation_method"])
    rule("P矩估计加最大似然", "probability_statistics", "A",
         [r"矩估计.{0,40}(最大|极大)似然", r"(最大|极大)似然.{0,40}矩估计"],
         pt="prob.type.maximum_likelihood_estimation",
         kps=["prob.knowledge.moment_estimation_method", "prob.knowledge.maximum_likelihood_method"])
    rule("P最大似然", "probability_statistics", "A", [r"最大似然", r"极大似然"],
         none_=[r"矩估计.{0,40}(最大|极大)似然"],
         pt="prob.type.maximum_likelihood_estimation", kps=["prob.knowledge.maximum_likelihood_method"])
    rule("P估计量评选", "probability_statistics", "A", [r"无偏", r"有效性", r"相合性"],
         pt="prob.type.estimator_criteria",
         kps=["prob.knowledge.unbiasedness", "prob.knowledge.efficiency_consistency"])
    rule("P点估计", "probability_statistics", "A", [r"点估计", r"估计量"],
         none_=[r"矩估计|最大似然|极大似然"],
         kps=["prob.knowledge.point_estimation"])
    rule("P置信区间", "probability_statistics", "A", [r"置信区间", r"置信度", r"置信水平"],
         none_=[r"两个正态"],
         pt="prob.type.single_normal_interval_estimation",
         kps=["prob.knowledge.single_normal_confidence_interval", "prob.knowledge.interval_estimation_concept"])

    # ================= 概率：假设检验 =================
    rule("P假设检验均值", "probability_statistics", "A", [r"均值的?检验", r"μ\s*的?检验", r"mu\s*的?检验"],
         pt="prob.type.single_normal_mean_test", kps=["prob.knowledge.single_normal_mean_test"])
    rule("P假设检验方差", "probability_statistics", "A", [r"方差的?检验", r"σ\s*.{0,4}检验"],
         pt="prob.type.single_normal_variance_test", kps=["prob.knowledge.single_normal_variance_test"])
    rule("P假设检验", "probability_statistics", "A",
         [r"假设检验", r"显著性水平", r"H_?0", r"检验假设", r"原假设", r"是否有显著"],
         none_=[r"均值的?检验", r"方差的?检验"],
         pt="prob.type.hypothesis_testing_concepts", kps=["prob.knowledge.hypothesis_testing_concepts"])


# ------------------------------------------------------------------ engine ---

STATS = collections.Counter()
RULE_HITS = collections.Counter()
CHAPTER_STAT = collections.defaultdict(lambda: collections.Counter())
UNMATCHED = collections.defaultdict(list)
UNMATCHED_PT = collections.defaultdict(list)
CONFLICTS: list = []


def subject_of_problem(p) -> str | None:
    ch = p.get("primaryChapterId") or ""
    if ch:
        return chapter_subject(ch)
    sg = p.get("subjectGuess") or ""
    return {"linear_algebra": "linear_algebra", "probability_statistics": "probability_statistics",
            "calculus": "calculus"}.get(sg)


def match_rule(rule_, text: str) -> bool:
    if not any(rx.search(text) for rx in rule_["any"]):
        return False
    for rx in rule_["all"]:
        if not rx.search(text):
            return False
    if rule_["sig"] and not any(rx.search(text) for rx in rule_["sig"]):
        return False
    for rx in rule_["none"]:
        if rx.search(text):
            return False
    return True


def process_problem(p, paper: str, year: int) -> dict:
    """对单题做保守打标决策，返回决策信息（不修改题目）。"""
    ch = p.get("primaryChapterId") or ""
    text = p.get("questionText") or ""
    info = {"paper": paper, "year": year, "id": p["id"], "ch": ch,
            "q": re.sub(r"\s+", " ", text)[:90],
            "fired": [], "pt": None, "kps": [], "conflict": False, "skip": None}
    need_pt = not p.get("primaryProblemTypeId")
    need_kp = not p.get("knowledgePointIds")
    if not need_pt and not need_kp:
        info["skip"] = "已打标"
        STATS["skip_已打标"] += 1
        return info

    ch_subject = chapter_subject(ch) if ch else None
    empty_chapter = not ch

    cand_pt: set[str] = set()
    new_kps: set[str] = set()
    for rule_ in R:
        if empty_chapter:
            if rule_["lvl"] != "A":
                continue
        else:
            if rule_["sub"] != ch_subject:
                continue
        if not match_rule(rule_, text):
            continue
        info["fired"].append(rule_["name"])
        RULE_HITS[rule_["name"] + (f"→pt:{rule_['pt']}" if rule_["pt"] else "") +
                  (("|kp:" + ",".join(rule_["kps"])) if rule_["kps"] else "")] += 1
        if need_pt and rule_["pt"]:
            if empty_chapter or PT_CHAPTER[rule_["pt"]] == ch:
                cand_pt.add(rule_["pt"])
        if need_kp:
            for k in rule_["kps"]:
                # kp 放宽到科目级匹配（subject 一致即可）；ptype 仍严格要求与章匹配
                if empty_chapter or KP_SUBJECT[k] == ch_subject:
                    new_kps.add(k)

    if len(cand_pt) == 1:
        info["pt"] = next(iter(cand_pt))
    elif len(cand_pt) > 1:
        info["conflict"] = True
        info["pt_conflicts"] = sorted(cand_pt)
        STATS["ptype_conflict跳过"] += 1

    info["kps"] = sorted(new_kps)
    return info


def apply_decision(d, info) -> list[str]:
    """把决策写入题目 dict，返回打上的 id 列表。"""
    tagged = []
    if info["pt"] and not d.get("primaryProblemTypeId"):
        d["primaryProblemTypeId"] = info["pt"]
        tagged.append(info["pt"])
    if not d.get("knowledgePointIds") and info["kps"]:
        d["knowledgePointIds"] = list(info["kps"])
        tagged.extend(info["kps"])
    if tagged:
        note = d.get("notes") or ""
        marker = f"；{NOTE_MARK}：{ '、'.join(tagged) }，待人工复核"
        if NOTE_MARK not in note:
            d["notes"] = (note + marker) if note else marker.lstrip("；")
    return tagged


# -------------------------------------------------------------------- main ---

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="只统计，不写文件")
    ap.add_argument("--show-unmatched", type=int, default=0,
                    help="每章打印 N 条未打上 ptype 的样例（校准规则用）")
    ap.add_argument("--verbose-conflicts", type=int, default=0,
                    help="打印 N 条 ptype 冲突样例")
    args = ap.parse_args()

    load_taxonomies()
    build_rules()

    # 规则引用 id 校验（防止打出不存在的 id）
    bad = []
    for rule_ in R:
        if rule_["pt"] and rule_["pt"] not in PT_CHAPTER:
            bad.append(f"规则 {rule_['name']} 引用不存在的 pt: {rule_['pt']}")
        for k in rule_["kps"]:
            if k not in KP_CHAPTER:
                bad.append(f"规则 {rule_['name']} 引用不存在的 kp: {k}")
    if bad:
        print("规则表校验失败：", *bad, sep="\n  ")
        return 1

    files = sorted(f for f in glob.glob(EXAM_GLOB))
    changed_files = 0
    for fp in files:
        with open(fp, encoding="utf-8") as f:
            doc = json.load(f)
        paper, year = doc.get("paper"), doc.get("year")
        doc_changed = False
        for p in doc.get("problems", []):
            ch_key = p.get("primaryChapterId") or "(空章节)"
            CHAPTER_STAT[ch_key]["总数"] += 1
            if not p.get("primaryProblemTypeId"):
                CHAPTER_STAT[ch_key]["空ptype"] += 1
            if not p.get("knowledgePointIds"):
                CHAPTER_STAT[ch_key]["空kp"] += 1
            info = process_problem(p, paper, year)
            if info["skip"]:
                continue
            if info["fired"]:
                STATS["有规则命中"] += 1
            if not info["pt"] and not info["kps"]:
                STATS["未打标"] += 1
                if args.show_unmatched and len(UNMATCHED[ch_key]) < args.show_unmatched:
                    UNMATCHED[ch_key].append(info)
            else:
                STATS["打上若干标签"] += 1
                if info["pt"]:
                    STATS["打上ptype"] += 1
                if info["kps"]:
                    STATS["打上kp题数"] += 1
                    STATS["打上kp个数"] += len(info["kps"])
                if not args.dry_run:
                    tagged = apply_decision(p, info)
                    if tagged:
                        doc_changed = True
                        STATS["写入标签个数"] += len(tagged)
            if info["conflict"] and args.verbose_conflicts and len(CONFLICTS) < args.verbose_conflicts:
                CONFLICTS.append(info)
            if (not info["pt"]) and not p.get("primaryProblemTypeId"):
                if args.show_unmatched and len(UNMATCHED_PT[ch_key]) < args.show_unmatched:
                    UNMATCHED_PT[ch_key].append(info)
        if doc_changed:
            with open(fp, "w", encoding="utf-8") as f:
                json.dump(doc, f, ensure_ascii=False, indent=1)
                f.write("\n")
            changed_files += 1

    # ---------------- 输出统计 ----------------
    total = sum(s["总数"] for s in CHAPTER_STAT.values())
    e_pt = sum(s["空ptype"] for s in CHAPTER_STAT.values())
    e_kp = sum(s["空kp"] for s in CHAPTER_STAT.values())
    print("=" * 64)
    print(f"文件数: {len(files)}  修改文件数: {changed_files if not args.dry_run else 0}  (dry-run={args.dry_run})")
    print(f"题目总数: {total}  空ptype: {e_pt}  空kp题数: {e_kp}")
    print("-" * 64)
    for k in ["skip_已打标", "有规则命中", "打上若干标签", "打上ptype", "打上kp题数", "打上kp个数",
              "ptype_conflict跳过", "未打标", "写入标签个数"]:
        print(f"{k}: {STATS[k]}")
    if e_pt:
        cov = STATS["打上ptype"] / e_pt
        print(f"ptype 覆盖率（相对空 ptype 题）: {cov:.1%}")
    if e_kp:
        cov = STATS["打上kp题数"] / e_kp
        print(f"kp 覆盖率（相对空 kp 题）: {cov:.1%}")
    print("-" * 64)
    print("规则命中分布（规则名→目标id: 次数）:")
    for name, n in sorted(RULE_HITS.items(), key=lambda x: -x[1]):
        print(f"  {n:4d}  {name}")
    print("-" * 64)
    print("按章统计（总数/空ptype/空kp/本轮打上ptype/打上kp题数）:")
    for ch_key, s in sorted(CHAPTER_STAT.items(), key=lambda x: -x[1]["总数"]):
        print(f"  {ch_key}: {s['总数']}/{s['空ptype']}/{s['空kp']}/{s['打上ptype']}/{s['打上kp题数']}")
    if args.show_unmatched:
        print("-" * 64)
        print("未打上 ptype 样例（校准用）:")
        for ch_key, items in UNMATCHED_PT.items():
            for it in items[:args.show_unmatched]:
                print(f"  [{ch_key}] {it['paper']} {it['year']} {it['id']} fired={it['fired'][:5]} cfl={it.get('pt_conflicts')}")
                print(f"      {it['q']}")
    if args.verbose_conflicts:
        print("-" * 64)
        print("ptype 冲突样例:")
        for it in CONFLICTS[:args.verbose_conflicts]:
            print(f"  [{it['ch'] or '(空章节)'}] {it['paper']} {it['year']} {it['id']} 冲突={it.get('pt_conflicts')}")
            print(f"      {it['q']}")
    return 0


CONFLICTS: list = []

if __name__ == "__main__":
    sys.exit(main())
