# 开发 Prompt：mathlink 升级为考研数学一/二/三全科覆盖

> 用法：把本文件全文作为任务提示交给编码 agent（或在 ZCode 中直接引用本文件路径）。
> 依据：2021 年起施行的考研数学大纲（2026 年沿用），已对照官方大纲原文及多家解析核实。

---

## 任务：将 mathlink（题间）从"高等数学单科"升级为"考研数学一/二/三全科大纲覆盖"

### 背景：本仓库现状（改造前必读）

- 技术栈：Tauri 2 + React 19 + KaTeX + SQLite；UI 全中文。
- `src/types.ts`：`Taxonomy` 接口为**单 subject**（高等数学）；`Problem` 只有 `questionImages`/`answerImages`（base64 图片）字段，**无题目文本、无来源、无难度、无内置/用户标记**。
- `src/taxonomy.ts`：构建期静态 `import` `data/calculus-taxonomy-v1.1.json`（8 章 / 41 题型 / 75 知识点 / 35 方法 + aliases）。
- `src/storage.ts`：浏览器端用 localStorage（`mathlink.problems.v1` 等 key）；`exportBackup()` 只导出不导入。
- `src-tauri/src/lib.rs`：Tauri 端只有 `list_problems`/`create_problem`/`add_attempt` 三条命令，SQLite 表 `problems`/`attachments`/`attempts`。
- `src/definitions.ts`：`seedDefinitions` 是"内置数据按 id 合并、用户数据优先"的现成先例。
- `data/problem-classification.schema.json`：已设计但未使用，且其 `methods.recommended_ids/alternative_ids` 与实现的扁平 `methodIds` 不一致。
- `docs/taxonomy-v1.md`：已规划 `applicable_exams`（按数一/二/三过滤）但未实现。
- `src/App.tsx` 内 `similarity()` 相关题推荐完全依赖标签，本次**不改其逻辑**。

### 目标（一句话）

支持三科（高等数学 / 线性代数 / 概率论与数理统计）、三卷（数一/二/三）的大纲树与过滤，题目支持文本（KaTeX）形态，建立"内置题库包"机制与批量导入，且**老用户数据无损升级**。

### 需求 1：taxonomy v2 —— 多科目 + 按卷打标

1. `Taxonomy.subject: TaxonomyItem` 改为 `subjects: TaxonomyItem[]`；每科目一个独立数据文件：`data/calculus-taxonomy-v1.1.json`（保留，id 不动）、`data/linear-algebra-taxonomy-v1.json`、`data/probability-taxonomy-v1.json`。
2. `TaxonomyItem` 与 `Taxonomy` 增加 `applicableExams?: ("math1"|"math2"|"math3")[]`（可标在 subject/chapter/problem_type/knowledge_point 层；题目过滤时取其所有标签的**并集**，展示章节树时按所选卷过滤）。
3. **高等数学**：现有 8 章 id 全部保持不变（兼容存量标签）；新增一章"向量代数和空间解析几何"（数一独有，`applicableExams: ["math1"]`），并按下列三卷差异给现有节点补 `applicableExams`：
   - 数一独有：方向导数与梯度、空间曲线切线/法平面与曲面切平面/法线、二元泰勒公式、三重积分、两类曲线/曲面积分、格林/高斯/斯托克斯公式、散度旋度、傅里叶级数、欧拉方程；
   - 数二不考：无穷级数全章、向量代数与空间解析几何、三重积分、曲线曲面积分；数二特色：物理应用（功/引力/压力/质心/形心）、曲率曲率圆、弧微分；高数占比约 80%；
   - 数三特色：常微分方程与差分方程（差分方程仅数三）、经济应用（边际/弹性）、无界区域上的反常二重积分；数三不考：空间解析几何、三重积分、曲线曲面积分、傅里叶级数、方向导数与梯度、曲率、物理应用。
4. **线性代数**（三卷通用 6 章）：行列式 / 矩阵 / 向量 / 线性方程组 / 矩阵的特征值和特征向量 / 二次型。数一独有节点（`["math1"]`）：向量空间及其相关概念、基变换与坐标变换、过渡矩阵、解空间。
5. **概率论与数理统计**（章表按数一 8 章建，数三差异用打标表达）：随机事件和概率 / 随机变量及其分布 / 多维随机变量及其分布 / 随机变量的数字特征 / 大数定律和中心极限定理 / 数理统计的基本概念 / 参数估计 / 假设检验。数三不考：假设检验全章、参数估计中的区间估计（节点级打标 `["math1"]`）；数二整科不考（subject 级 `["math1","math3"]`）。
6. 每科 problem_types / knowledge_points / methods 的规模对齐现有高数（约 40/75/35 量级），沿用现有 id 前缀风格与 aliases 结构；自定义标签机制不变。

### 需求 2：数据模型扩展

`src/types.ts`、Rust 侧 mirror structs、SQLite 三处同步：

```ts
interface Problem {
  // ...现有字段全部保留...
  questionText?: string;   // 含 $...$ / $$...$$ 的 LaTeX 文本（与图片二选一或并存）
  answerText?: string;
  origin: "builtin" | "user";
  difficulty?: 1 | 2 | 3 | 4 | 5;
  source?: {
    kind: "exam" | "example" | "custom";
    year?: number;                    // kind=exam
    paper?: "math1" | "math2" | "math3";
    number?: number;                  // 题号
    book?: string;                    // kind=example，如 "Active Calculus"
    section?: string;                 // 如 "§4.2"
    license?: string;                 // 如 "CC BY-SA 4.0"
  };
}
```

- 迁移：SQLite 加 schema version 与迁移逻辑（ALTER 或重建拷贝）；localStorage key 升到 `mathlink.problems.v2` 并写 v1→v2 迁移函数（存量题补 `origin: "user"`）。
- `builtin` 题只读：UI 禁止编辑/删除标签与内容，但允许添加 attempt（做题记录）；`user` 题行为不变。

### 需求 3：内置题库与批量导入

1. `data/banks/` 放题库 JSON（本次只需每科 2–3 道**示例题**作为 fixture，真实内容另行制作）；格式对齐 `data/problem-classification.schema.json`（先把该 schema 的 methods 结构改为扁平 `methodIds` 与实现一致）。
2. Rust 新增：`bulk_import_problems(bank: JsonValue)` —— 按 id 幂等 upsert（重复导入不产生重复题）；`import_bank_from_file(path)` —— 供 UI"导入题库包"；`exportBackup` 补上对应的 `importBackup` 形成闭环（含文本题与图片 base64）。
3. 首次运行 seed：内置 banks 走与 `seedDefinitions` 相同的 merge-by-id 逻辑（新版本 app 追加新内置题时，用户已有的做题记录保留）。

### 需求 4：UI 变更

1. 顶部或侧栏增加**科目切换**（高等数学 / 线性代数 / 概率论与数理统计）；概览页章节树随科目 + **卷种选择**（数一/数二/数三/全部）按 `applicableExams` 过滤。
2. 列表筛选器增加：卷种、来源（真题/例题/自录）、难度、年份。
3. 题目卡：`questionText`/`answerText` 用现有 `FormulaText`（KaTeX）渲染，与图片并存时文本在上；显示来源徽章（如「2020 · 数一 · 第 9 题」「Active Calculus §4.2 · CC BY-SA」）与内置标识。
4. 录入表单：新增"文本模式"（题干/答案 LaTeX 输入 + 实时 KaTeX 预览），保留图片模式；必填校验改为"文本或图片至少其一"。

### 需求 5：测试与验收标准

- 单测：taxonomy 多科目加载与卷种过滤（数一/二/三三个视角的章节树快照）；localStorage v1→v2 迁移；SQLite 升级迁移；`bulk_import_problems` 幂等性。
- 验收清单：
  1. 旧版本数据（含自定义标签、做题记录、定义）升级后完整保留；
  2. 数一视角显示三科全量章节；数二视角无概率科目、高数无级数/空间几何章；数三视角概率无假设检验章；
  3. 文本题 KaTeX 渲染正确（用 fixture 内 20+ 道含分式/矩阵/积分/概率符号的题验证）；
  4. 内置题不可编辑但可记录 attempt；重复导入同一 bank 题数不变；
  5. 导出→导入往返数据一致；
  6. 桌面（Tauri）与浏览器（localStorage）两种后端行为一致。

### 约束

- 不改 `similarity()` 相关题算法（标签仍按科目内生效即可）；
- 保持现有设计语言与全中文 UI；不引入新的大型依赖（KaTeX 已有）；
- 大纲内容如需补充细节，以当年官方《数学考试大纲》为准，不要凭记忆编造考点；
- 本任务**不制作真实题库内容**（题库包另行生产），只交付机制 + fixture。

---

### 附：三卷考试结构（2021 起，供过滤与展示参考）

| 卷 | 科目与占比 | 题型 |
|---|---|---|
| 数学一 | 高数约 60% / 线代约 20% / 概率约 20% | 10 单选×5 + 6 填空×5 + 6 解答 70 分，共 22 题 150 分 |
| 数学二 | 高数约 80% / 线代约 20%（不考概率） | 同上 |
| 数学三 | 微积分约 60% / 线代约 20% / 概率约 20% | 同上 |
