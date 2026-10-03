# 真题空白打标统计与保守自动打标报告（审计 Agent C）

日期：2026-10-03　工具：`tools/auto-tag-exams.py`　数据：`data/banks/exams/`（math1/math2，共 78 卷 1710 题；仓库无 math3 目录）

## 一、空白打标分布统计（处理前）

总体：**1710 题中 `primaryProblemTypeId` 为空 1250 题（73.1%），`knowledgePointIds` 为空数组 370 题（21.6%）**。math1 为近期 OCR 入库卷，ptype 完全未打；math2 已有约 54% ptype。

按卷种：

| 卷种 | 题数 | 空 ptype | 占比 | 空 kp | 占比 |
|---|---|---|---|---|---|
| math1 | 852 | 852 | 100% | 335 | 39.3% |
| math2 | 858 | 398 | 46.4% | 35 | 4.1% |

按章（空 ptype / 总数，按空 ptype 降序）：

| 章 | 总数 | 空 ptype | 空 kp |
|---|---|---|---|
| (空章节) | 330 | 330 | 306 |
| one_variable_differential | 272 | 137 | 0 |
| one_variable_integral | 232 | 101 | 25 |
| multivariable_differential | 112 | 97 | 0 |
| function_limit_continuity | 153 | 88 | 19 |
| differential_equation | 118 | 64 | 11 |
| la.chapter.matrices | 60 | 50 | 0 |
| multiple_integral | 58 | 43 | 3 |
| la.chapter.eigenvalues | 45 | 35 | 0 |
| curve_surface_integral | 40 | 40 | 0 |
| infinite_series | 63 | 57 | 2 |
| la.chapter.vectors | 34 | 32 | 0 |
| la.chapter.linear_systems | 36 | 29 | 0 |
| prob.chapter.random_variables | 34 | 34 | 0 |
| la.chapter.quadratic_forms | 27 | 21 | 0 |
| prob.chapter.multidimensional_random_variables | 19 | 19 | 0 |
| vector_algebra_and_space_analytic_geometry | 18 | 18 | 0 |
| prob.chapter.parameter_estimation | 14 | 14 | 0 |
| prob.chapter.random_events | 12 | 12 | 0 |
| la.chapter.determinants | 12 | 8 | 0 |
| prob.chapter.numerical_characteristics | 11 | 11 | 4 |
| prob.chapter.mathematical_statistics | 9 | 9 | 0 |
| prob.chapter.hypothesis_testing | 1 | 1 | 0 |

注意：math1 OCR 初卷存在**按题号推算的章节错置**（notes 已注明"科目归类为按题号推算"），实测约 58 题空 ptype 题的内容科目与其挂靠章不符（如概率题挂在 infinite_series 章、矩阵题挂在 prob.chapter.numerical_characteristics 章）。本工具对这些题**拒绝打标**（见第四节），待章节修复后再补打。

## 二、保守规则设计（tools/auto-tag-exams.py）

- **只填空字段**：仅当 `primaryProblemTypeId` 为空 / `knowledgePointIds` 为空数组时处理；运行前即时重读文件，幂等可重跑。
- **科目/章门禁**：已知章的题只允许命中「章前缀推导科目」的规则（`la.*` → 线代，`prob.*` → 概率，其余 → 高数）；ptype 的 taxonomy `chapter_id` 必须与题的 `primaryChapterId` 一致；kp 放宽到**科目级**一致（章本身可能错置，但科目必须对）。
- **空章节题**：仅允许 level=A（强关键词）规则，跨科目按关键词匹配，无法校验章匹配，一律在 notes 标注"待人工复核"。
- **冲突放弃**：多条规则给出不同 ptype 时放弃该题的 ptype（宁缺勿滥）；用 none-排除表消解"模板词误触发"（如"取得极值""分布函数为""均值为 2"等语境词）。
- **复合问法显式规则**：对经典多问题用精确复合关键词打标（如"收敛域，并求其和函数"→ power_series_sum、"分布律和数学期望"→ discrete_distribution_law+双 kp、"矩估计…最大似然"→ maximum_likelihood_estimation+双 kp）。
- notes 末尾幂等追加 `；自动打标(规则)：<id 列表>，待人工复核`。

## 三、运行结果

- 修改 70 个卷文件，写入 **1014 个标签**：**ptype 744 题（占空 ptype 1250 的 59.5%）**，**kp 183 题 / 270 个（占空 kp 370 题的 49.5%）**。
- 跳过：445 题两字段均已有值不动；90 题因多规则冲突放弃 ptype；约 466 题无可靠 ptype 证据不打。
- 打上 ptype 按卷种：math1 502、math2 242。按章（前列）：(空章节) 181、one_variable_integral 75、function_limit_continuity 72、multivariable_differential 54、differential_equation 49、one_variable_differential 46、la.matrices 36、infinite_series 31、curve_surface_integral 29、multiple_integral 29、la.vectors 28、la.eigenvalues 25、prob.random_variables 18、la.quadratic_forms 15、prob.parameter_estimation 13、la.linear_systems 12、la.determinants 7、prob.numerical_characteristics 6、prob.multidim 6、vector_algebra 4、prob.random_events 4、prob.math_statistics 3、prob.hypothesis_testing 1。
- 高频规则（节选）：i定积分 82、f函数极限 77、m复合链式 56、o二阶线性 52、m偏导全微分 49、g二重积分 42、i变上限积分式 36、d极值最值 34、i几何应用 32、L特征值计算 31、L逆矩阵 28、f数列极限 27、c第二类曲线积分(式) 44、L方程组通用 22 等（完整分布见工具运行输出）。

### 校验（全部通过）

1. 重跑幂等：连续第二次运行 0 文件修改。
2. 与 HEAD 逐题对比：**无任何已有 ptype/kp 被覆盖**，notes 全部为追加式修改。
3. 写入的 1014 个 id 全部存在于对应 taxonomy；ptype 与题章匹配；kp 与题科目匹配。

## 四、未覆盖部分的原因分析

1. **章节错置被门禁拦截（约 58 题）**：内容科目与挂靠章不一致（多为 math1 OCR 初卷按题号推算所致）。这是正确的保守行为——按章打标会直接打错科目。修复章节后重跑本工具即可补齐。
2. **多问复合大题（约 90 题冲突放弃）**：如"F(t)=∭Ω f 与 ∬D f 比较＋证明存在唯一 t"、"（1）求分布函数（2）求矩估计"等，两个子问属于不同题型，无法给出唯一 ptype，按"宁缺勿滥"放弃（经典复合问法已用显式复合规则覆盖约 20 题）。
3. **taxonomy 缺位**：多元"切平面/法线"类题在 calculus-taxonomy v1.2 只有 kp（geometric_applications_multivariable）没有对应 ptype，约 15 题只打了 kp。
4. **题面证据不足**：应用建模题（雪堆融化、小山高度、生产线人数递推等）题面无显式方法词；"三个箱子取球"类全概率模型题未出现"全概率"字样——一律不打。
5. **OCR 占位坏题**：如 2020 math2 的"选择题 -（1）D -（2）C…"占位题，无题面可依据。
6. kp 覆盖率 49.5% 的天花板：370 空 kp 题中 306 题是空章节题（多为综合大题/证明题），强关键词证据不足的部分保持空白，等人工打标。

## 五、20 例抽查（人工判定）

以下 id 均为 notes 中"自动打标(规则)"标记所列、本工具实际写入的标签（部分 kp 之后被打标修复 agent 微调，以本工具标注为准）：

| # | 题 | 题干（截断） | 本工具标注 | 判定 |
|---|---|---|---|---|
| 1 | m1-1995.19 | 设 3 阶实对称矩阵 A 的特征值为 λ1=-1, λ2=λ3=1…求 A | eigenvalue_computation + eigen_concept + symmetric_matrix | ✅ 正确 |
| 2 | m1-2009.1 | x→0 时 f=x-sin ax 与 g=x²ln(1-bx) 是等价无穷小量 | function_limit | ✅ 正确（更细可作 parameter_limit，不算错） |
| 3 | m1-2023.5 | ABC=O，分块矩阵 [O A; BC E] 相关命题 | matrix_rank | ✅ 合理 |
| 4 | m1-2024.3 | 幂级数和函数为 ln(2+x)，求 ∑na₂ₙ | power_series_sum | ✅ 正确 |
| 5 | m1-1993.14 | 计算曲面积分 ∬Σ 2xz dydz+… | surface_integral_second_kind | ✅ 正确 |
| 6 | m1-2002.25 | 离散总体概率分布表，求 θ 的（矩估计/最大似然）估计 | maximum_likelihood_estimation + 矩估计法 kp + 最大似然 kp | ✅ 正确（复合规则） |
| 7 | m1-2015.13 | n 阶行列式求值 | determinant_computation | ✅ 正确 |
| 8 | m1-2020.20 | 二次型经正交变换化为 g(y1,y2) | orthogonal_standard_form | ✅ 正确 |
| 9 | m1-2016.23 | 求 c 使 T_c 为 θ 的无偏估计并讨论 | estimator_criteria | ✅ 正确（无偏性评选） |
| 10 | m1-2003.20 | 反函数变换化简二阶微分方程 | linear_higher_order_equation + inverse_derivative | ✅ 正确 |
| 11 | m2-1987.15 | 判断 \|x sinx\|e^cosx 是有界/单调/周期/偶函数 | function_properties | ✅ 正确 |
| 12 | m2-2011.13 | 计算 ∬_D xy dσ | double_integral | ✅ 正确 |
| 13 | m2-1998.21 | α 组讨论线性表示 | linear_representation | ✅ 基本正确 |
| 14 | m2-2001.9 | f'' 严格单调减，判断 f(1) 极值与拐点 | monotonicity_extrema | ✅ 正确 |
| 15 | m2-2006.2 | 含变上限积分的分段函数在 x=0 连续求 a | integral_defined_function | ✅ 正确 |
| 16 | m2-2024.9 | A(A-A*)=O 判断 r(A) 取值 | adjoint_matrix | ✅ 合理 |
| 17 | m2-2000.5 | B=(E-A)⁻¹ 相关矩阵运算 | inverse_matrix | ✅ 合理 |
| 18 | m2-2008.18 | 计算 ∬_D max{xy,1} dxdy | double_integral | ✅ 正确 |
| 19 | m1-1987.13 | \|A\|=a≠0，求 \|A*\| | adjoint_matrix + adjoint kp | ✅ 正确 |
| 20 | m2-2023.4 | y''+ay'+by=0 的解有界，判断参数条件 | linear_higher_order_equation + function_properties(kp) | ⚠️ ptype 正确；kp function_properties 因"有界"关键词偏泛（此处指解的有界性而非函数性质概念），建议复核为特征方程相关 kp |

**抽查结论：20 例中 19 例打标正确/合理，1 例 kp 偏泛（已标注待人工复核）**，准确率约 95%，符合"精确率优先"目标。

## 六、协作与后续

- 运行期间打标修复 agent 提交了 be9ef6e（13 处错标映射），并对本工具写入的个别 kp 做了并发微调；本工具 notes 标记保留了完整审计轨迹，重跑已验证幂等且不覆盖其修改。
- 章节/科目错置修复后，直接重跑 `python3 tools/auto-tag-exams.py` 可安全补打（只填空字段）。
