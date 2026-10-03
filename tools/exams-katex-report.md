# KaTeX 全量渲染冒烟报告（真题 + 题库）

- 工具：`tools/katex-smoke-exams.mjs`
- 日期：2026-10-03
- 环境：worktree `feat/audit-exams`，KaTeX 0.16.47（与 App 同版本）

## 方法

- 覆盖范围：`data/banks/exams/{math1,math2}` 共 78 卷（`index.json` 为纯索引无正文，跳过；本分支暂无 math3 目录），另加 `data/banks/` 下 8 个题库 JSON，合计 86 个文件、**2255 题**。
- 对每题 `title` / `questionText` / `answerText` / `notes` 四字段做公式切分，切分规则与 `src/components/FormulaText.tsx` 完全一致（`$$...$$` 可跨行、优先于 `$...$`；`$...$` 不跨行），逐段 `katex.renderToString`，`displayMode` 按定界符。
- 渲染参数：`throwOnError: true, strict: false, trust: false`（App 为 `throwOnError: false, strict: "ignore"`，因此本冒烟是 App 行为的严格超集：任何本报告失败项在 App 中都会渲染为红色错误文本）。
- 失败 = 抛出解析/渲染错误；warn（如 ①–④、℃ 无字符度量）不算失败，单独记录（App 的 `strict: "ignore"` 下这些字符可正常渲染）。

## 总览

| 指标 | 数值 |
| --- | --- |
| 文件数 | 86（78 卷 + 8 题库） |
| 题目数 | 2255（真题 1710 + 题库 545） |
| 含 `$` 文本 | 4494 |
| 公式总数 | 35110（display `$$...$$` 2959 + inline `$...$` 32151） |
| 首轮失败 | 3 |
| 保守修复 | 2 |
| 标记待人工核对 | 1 |
| 复跑未处理失败 | **0** |
| warn（不算失败） | 26 |

## 已修复（2 处，均为明确笔误）

1. `data/banks/exams/math2/2005.json` 题 `bank.exam.m2-2005.18`（answerText，display 公式）
   - 原文：`...\cdot\frac{\mathrm{d}y}{\mathrm{d}t .` —— `\frac` 第二个参数缺右花括号（报错 “Unexpected end of input in a macro argument”）。
   - 修复：补 `}`，改为 `\frac{\mathrm{d}y}{\mathrm{d}t} .`（句点移到分数外，语义不变）。
2. `data/banks/exams/math2/2011.json` 题 `bank.exam.m2-2011.17`（questionText）
   - 原文：`\left.\frac{\partial^{2}z}{\partial x\partial y}\right|_{\substack{x=1\\\y=1}}` —— `\\` 后多一个反斜杠产生未定义控制序列 `\y`。
   - 修复：删去多余反斜杠，改为 `\substack{x=1\\y=1}`（与同卷他处的正确写法一致）。

## 待人工核对（1 处）

1. `data/banks/exams/math1/2023.json` 题 `bank.exam.m1-2023.8`（questionText，2023 数一第 8 题）
   - 原文：`E ( | X - E X | ) = \left( \begin{array} { l l } { \begin{array} { r l } \end{array} } &  \right) \end{array}`
   - 报错：`Expected & or \\ or \cr or \end at position …`
   - 判断：疑似 PDF 表格抽取产生的乱码嵌套 array（大概率原意为填空括号或选项表格），语义不可确证，按纪律**不改题面**，已在 notes 末尾追加「；审计标记：此处公式渲染失败待人工核对」。该题选项 A「1e」的写法也建议一并人工复核。

## warn 记录（26 条，均不构成失败）

类型分布（去重后 5 类，全部为 “No character metrics …”，App `strict:"ignore"` 下正常渲染）：

| 字符 | 条数 |
| --- | --- |
| ① | 8 |
| ② | 4 |
| ③ | 7 |
| ④ | 5 |
| ℃ | 2 |

涉及文件：`math1/2002.json`（12）、`math2/2022.json`（10）、`math1/2007.json`（2）、`calculus-actcal3-v1.json`（2，℃）。

## OCR 卷公式质量结论

数一 2024（22 题 131 公式）、数一 2026（22 题 177 公式）两卷为 OCR 转录入卷，本轮全量渲染 **0 失败、0 warn**，转录质量良好；唯一确认的 OCR/抽取损伤位于 2023 卷第 8 题（已标记待人工核对），2023 卷同为转录批次（notes 含「OCR/文本转录初稿」）。

## 复跑结果

修复后重跑冒烟：失败 1（即上述已标记待人工核对项），**未处理失败 0**，warn 26（不变），达成目标。

## 附：按文件公式数

题库 8 个文件合计 8034 公式（hefferon 2092、gs 1817、actcal3 1731、actcal 1718、actcal2 1493、cal 65、la 49、prob 69）；真题卷合计 27076 公式。各卷明细可用 `node tools/katex-smoke-exams.mjs --json` 复现。
