import type { ExamId, Problem, ProblemSource, Taxonomy, TaxonomyItem } from "../types";

/** 卷种筛选：all = 不过滤（全部卷种） */
export type ExamFilter = "all" | ExamId;

export const examLabels: Record<ExamId, string> = { math1: "数一", math2: "数二", math3: "数三" };

export const examFilterOptions: Array<{ id: ExamFilter; label: string }> = [
  { id: "all", label: "全部" },
  { id: "math1", label: "数一" },
  { id: "math2", label: "数二" },
  { id: "math3", label: "数三" }
];

export const sourceKindOptions: Array<{ id: ProblemSource["kind"]; label: string }> = [
  { id: "exam", label: "真题" },
  { id: "example", label: "例题" },
  { id: "custom", label: "自录" }
];

/**
 * 节点卷种适用性（并集语义）：未打标 = 不限卷种；打标后包含所选卷即适用。
 * 完全由数据打标（applicableExams）驱动，不硬编码科目/章节名。
 */
export function nodeApplies(item: { applicableExams?: ExamId[] } | undefined, exam: ExamFilter): boolean {
  if (exam === "all") return true;
  const exams = item?.applicableExams;
  return !exams || exams.length === 0 || exams.includes(exam);
}

/** 科目级适用性（listSubjects() 返回的 subject 项打标，如数二视角下概率科目整体隐藏） */
export function subjectApplies(subject: TaxonomyItem, exam: ExamFilter): boolean {
  return nodeApplies(subject, exam);
}

/**
 * 按卷种过滤大纲树：章节按自身打标过滤；
 * 题型/知识点除自身打标外，还需其所属章节可见（章节被隐藏时其下节点一并隐藏）。
 */
export function filterTaxonomyForExam(taxonomy: Taxonomy, exam: ExamFilter): Taxonomy {
  if (exam === "all") return taxonomy;
  const chapters = taxonomy.chapters.filter((chapter) => nodeApplies(chapter, exam));
  const visibleChapterIds = new Set(chapters.map((chapter) => chapter.id));
  const belongsToVisibleChapter = (item: TaxonomyItem) =>
    !item.chapter_id || visibleChapterIds.has(item.chapter_id);
  return {
    ...taxonomy,
    chapters,
    problem_types: taxonomy.problem_types.filter((item) => belongsToVisibleChapter(item) && nodeApplies(item, exam)),
    knowledge_points: taxonomy.knowledge_points.filter((item) => belongsToVisibleChapter(item) && nodeApplies(item, exam)),
    methods: taxonomy.methods.filter((item) => nodeApplies(item, exam))
  };
}

/** 题目归属科目：主章节（或主题型）出现在该科目大纲中即归属 */
export function problemInSubject(problem: Problem, taxonomy: Taxonomy): boolean {
  if (problem.primaryChapterId && taxonomy.chapters.some((chapter) => chapter.id === problem.primaryChapterId)) return true;
  return Boolean(problem.primaryProblemTypeId && taxonomy.problem_types.some((type) => type.id === problem.primaryProblemTypeId));
}

/**
 * 题目卷种归属：取其全部标签（章节/题型/知识点/方法）applicableExams 的**并集**判断；
 * 并集为空（全部未打标）视为不限卷种。在科目大纲内解析，跨科目标签天然不参与。
 */
export function problemAppliesToExam(problem: Problem, taxonomy: Taxonomy, exam: ExamFilter): boolean {
  if (exam === "all") return true;
  const union = new Set<ExamId>();
  const collect = (id: string, items: TaxonomyItem[]) => {
    const item = items.find((candidate) => candidate.id === id);
    if (item?.applicableExams) for (const examId of item.applicableExams) union.add(examId);
  };
  collect(problem.primaryChapterId, taxonomy.chapters);
  for (const id of problem.secondaryChapterIds) collect(id, taxonomy.chapters);
  collect(problem.primaryProblemTypeId, taxonomy.problem_types);
  for (const id of problem.secondaryProblemTypeIds) collect(id, taxonomy.problem_types);
  for (const id of problem.knowledgePointIds) collect(id, taxonomy.knowledge_points);
  for (const id of problem.methodIds) collect(id, taxonomy.methods);
  return union.size === 0 || union.has(exam);
}

/** 来源分类：无 source 的旧数据归为“自录”（custom） */
export function sourceKindOf(problem: Problem): ProblemSource["kind"] {
  return problem.source?.kind ?? "custom";
}

/** 来源徽章文案：真题「2020 · 数一 · 第9题」；例题「书名 §节 · 许可」；自录/无来源不显示（null） */
export function formatSource(source?: ProblemSource): string | null {
  if (!source) return null;
  if (source.kind === "exam") {
    const parts = [source.year, source.paper ? examLabels[source.paper] : "", source.number ? `第${source.number}题` : ""]
      .filter(Boolean).map(String);
    return parts.length ? parts.join(" · ") : "真题";
  }
  if (source.kind === "example") {
    const parts = [source.book, source.section, source.license].filter((part) => Boolean(part && part.trim()));
    return parts.length ? parts.join(" · ") : "例题";
  }
  return null;
}

/** 难度星标：如 3 → “★★★☆☆”；未设置返回空串 */
export function difficultyStars(difficulty?: number): string {
  const level = Math.round(difficulty ?? 0);
  if (level < 1 || level > 5) return "";
  return "★".repeat(level) + "☆".repeat(5 - level);
}

/** 录入表单的来源草稿状态（kind="none" 表示不填写 source，保存时归为自录旧数据形态） */
export type SourceFormState =
  | { kind: "none" }
  | { kind: "custom" }
  | { kind: "exam"; year: string; paper: ExamId; number: string }
  | { kind: "example"; book: string; section: string; license: string };

export function sourceFormOf(kind: string): SourceFormState {
  if (kind === "exam") return { kind: "exam", year: "", paper: "math1", number: "" };
  if (kind === "example") return { kind: "example", book: "", section: "", license: "" };
  if (kind === "custom") return { kind: "custom" };
  return { kind: "none" };
}

/** 表单来源草稿 → ProblemSource；未填写的可选项不落入数据 */
export function buildSource(form: SourceFormState): ProblemSource | undefined {
  if (form.kind === "none") return undefined;
  if (form.kind === "custom") return { kind: "custom" };
  if (form.kind === "exam") {
    const source: ProblemSource = { kind: "exam", paper: form.paper };
    const year = Number(form.year);
    const number = Number(form.number);
    if (form.year.trim() !== "" && Number.isFinite(year)) source.year = year;
    if (form.number.trim() !== "" && Number.isFinite(number)) source.number = number;
    return source;
  }
  const source: ProblemSource = { kind: "example" };
  if (form.book.trim()) source.book = form.book.trim();
  if (form.section.trim()) source.section = form.section.trim();
  if (form.license.trim()) source.license = form.license.trim();
  return source;
}
