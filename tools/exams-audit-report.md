# 真题库多科目审计报告（Agent A：非法打标修复）

日期：2026-10-03　分支：`feat/audit-exams`　校验工具：`tools/validate-exams.py`

## 一、审计范围与统计总览

| 项 | 数值 |
|---|---|
| 卷文件 | 78 个（math1 38 卷 + math2 40 卷） |
| 题目总数 | 1710（math1 852 题 + math2 858 题） |
| 年份覆盖 | math1 1987–2026（缺 1994、2022）；math2 1987–2026 全覆盖 |
| index.json | 78 条，重建统计后与卷文件完全一致 |
| `$`/`$$` 配对 | 全库 0 处问题 |
| 未打标 primaryProblemTypeId（空串） | 1250 题（不算非法，属空白打标统计范围） |
| 非法打标 id（最终复检） | **0** |

说明：本 worktree（`feat/audit-exams` 分支）只含 math1/math2 两个子目录；主树的 math3 目录未进入本分支，不在本次审计范围。

## 二、校验器设计要点

1. **科目路由**：题目 `primaryChapterId` 以 `la.` 开头用线代 taxonomy（`linear-algebra-taxonomy-v1.json`），以 `prob.` 开头用概率 taxonomy（`probability-taxonomy-v1.json`），其余（含空）用微积分 taxonomy（`calculus-taxonomy-v1.2.json`）；每题整体只用一个 taxonomy。
2. **防跨科目误报**：带 `la.`/`prob.` 前缀的非章节 id 按其自身前缀对应 taxonomy 查存在性（空主章节的题目若按默认微积分路由，会把合法的线代知识点误判为非法）。
3. `primaryProblemTypeId == ""` 视为「未打标」单独计数，不算非法。
4. `$`/`$$` 配对：按 `$$` 分割，偶数段（`$$` 之外）内 `$` 个数须为偶；`$$` 出现奇数次亦判不配对（转义 `\$` 不参与）。
5. 数量规则：knowledgePointIds 0–3、methodIds 0–2；另检查列表内重复 id。
6. index 一致性：文件存在、year/paper/total/withAnswer 与卷文件相符、无孤立条目。
7. 分级：非法 id、$ 配对、数量越界、index 不符为 ERROR；主章节未打标、跨科目打标、重复 id 为 WARN。

## 三、初扫疑云的结论

- **初扫「732 题非法章」**：按科目路由重验后，**非法章节 id 为 0**，确认为跨科目误报（章节 id 均在其所属科目 taxonomy 中真实存在）。
- **初扫 `piecewise_derivative`（4 题）、`sequence_limit`（3 题）**：确认为非法 id——二者只是微积分 taxonomy 中的**题型 id**，被误用作**知识点 id**，知识点表中不存在，已修复（见下）。
- 初扫检出的 67 处 `la.knowledge.*`「非法」：这些 id 全部真实存在于线代 taxonomy，问题在于 24 道题（math2 1997–2003 线代题）`primaryChapterId` 为空导致路由失效；按防误报规则改按 id 前缀校验后全部合法，不属非法打标（主章节空缺移交空白打标处理）。

## 四、修复清单（13 处，12 个卷文件）

复检确认的非法打标共 4 个不同 id、12 处；另发现 1 处跨科目错标。全部读题面后映射到 taxonomy 中语义最接近的真实 id，并在 notes 末尾追加「审计修复」说明。

| 题目 | 字段 | 原打标（非法） | 修复为 | 依据（题面内容） |
|---|---|---|---|---|
| m2-1995.10 | knowledgePointIds | piecewise_derivative | derivative_arithmetic_rules | F(x)=f(x)(1+\|sin x\|) 可导性，乘积结构左右导数 |
| m2-1996.18 | knowledgePointIds | piecewise_derivative | differentiability_continuity | 分段函数反函数 g(x) 的间断点/不可导点判断 |
| m2-1998.7 | knowledgePointIds | piecewise_derivative | derivative_definition | \|x³−x\| 不可导点个数，按导数定义判 c\|x−a\| 型因子 |
| m2-1999.6 | knowledgePointIds | piecewise_derivative | derivative_definition | 分段函数在 x=0 的连续性与左右导数 |
| m2-1999.16 | primaryProblemTypeId | taylor_formula | mean_value_theorem | 泰勒展开证 f‴(ξ)=3 中值型结论 |
| m2-2001.18 | primaryProblemTypeId | taylor_formula | limit_proof | 佩亚诺余项泰勒展开证 λ 组唯一性（h→0 极限等式） |
| m2-2002.18 | primaryProblemTypeId | taylor_formula | limit_proof | 同上（2001 年题重考） |
| m2-2021.5 | primaryProblemTypeId | taylor_formula | derivative_calculation | 求 sec x 的 2 次泰勒多项式系数，即求 f'(0)、f''(0) |
| m2-2017.3 | knowledgePointIds | sequence_limit | limit_operations | 收敛数列极限性质判断，极限运算法则范畴 |
| m2-2018.21 | knowledgePointIds | sequence_limit | monotonicity | 递推数列单调有界收敛性证明 |
| m2-2022.6 | knowledgePointIds | sequence_limit | limit_operations | 数列极限存在性（sin 严格增传递收敛性） |
| m1-2016.6 | knowledgePointIds | quadric_surface_equations | la.knowledge.orthogonal_standard_form | 本题路由为线代（二次型）；该 id 只在微积分 taxonomy，解答用「特征值即标准形系数」判断曲面类型，故映射线代正交标准形知识点 |
| m1-2005.7 | knowledgePointIds | prob.knowledge.functions_of_random_variables | limit_operations | 题面为纯高数题（f(x)=limⁿ√(1+\|x\|³ⁿ) 求不可导点），概率知识点系错标；先求数列极限得分段表达式，故映射极限运算法则 |

注：前 11 处为「确认不存在」的 id，notes 追加「原打标 <旧> 不存在，已改为 <新>」；后 2 处分别追加「不属线代 taxonomy」「与题面科目不符」的准确表述。

## 五、index.json 一致性

- 初验：110 处不符——index 生成于旧快照（约 76 卷 1559 题时期），此后卷文件经历校对/解析器 v3、v4 重建，early 年份 total 与 withAnswer 全面过期。
- 处理：按当前卷文件重建全部 78 条记录的 `total` 与 `withAnswer`（77 条有变化），年份/卷种原本即相符；重建后校验器判 index 一致性 OK。

## 六、遗留问题（未修，附原因）

1. **14 题 knowledgePointIds 超上限 3**（4–6 个，均在 math1 2004–2013 的线代/概率综合大题，id 本身全部合法）。按「不许删打标」纪律不裁剪，留待人工按主次取舍。清单：
   m1-2004.23(4)、m1-2005.14(5)、m1-2006.20(4)、m1-2006.21(6)、m1-2008.22(4)、m1-2008.23(4)、m1-2009.8(4)、m1-2009.22(4)、m1-2010.6(4)、m1-2010.23(4)、m1-2011.23(5)、m1-2012.23(4)、m1-2013.6(4)、m1-2013.22(4)。
2. **330 题主章节未打标**（WARN），其中 24 题为 math2 1997–2003 线代题（可据 la.* 知识点前缀机械回填，如 m2-1997.16 → la.chapter.matrices）。属空白打标范围，移交相应 agent/后续处理。
3. **1250 题 primaryProblemTypeId 空串**：属空白打标统计范围（Agent C），本次不动。
4. **m2-1999.6 主章节疑似错标**：`multivariable_differential`，但题面为一元分段函数连续性/可导性，建议改 `one_variable_differential`。因属「存在但语义不符」的章节 id（非非法 id），列入报告不改。
5. **部分近年卷题量不全**：m1-2020（14 题）、m1-2021（13 题）、m1-2025（8 题）、m2-2020（9 题），疑为转录未完成；index 已按实际题数对齐。
6. math1 缺 1994、2022 年卷（源缺失或未入库），math3 全科目不在本分支。

## 七、复检结论

修复后重跑 `python3 tools/validate-exams.py`：

- 非法打标 id：**0**；跨科目打标：**0**；`$`/`$$` 配对问题：**0**；index 一致性：**OK**。
- 剩余 ERROR 仅 14 处 kp 数量超限（合法 id，见遗留 1）；WARN 330 处主章节未打标（遗留 2、3），均不属「非法 id」。
