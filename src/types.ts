export type TagKind = "problem_type" | "knowledge_point" | "method";
export type AttemptResult = "correct" | "wrong" | "unfinished";

/** 考研数学卷种：数一 / 数二 / 数三 */
export type ExamId = "math1" | "math2" | "math3";

export interface TaxonomyItem {
  id: string;
  name: string;
  chapter_id?: string;
  description?: string;
  origin?: "builtin" | "user";
  /** 各级节点可打标：该节点适用于哪些卷种（缺省表示不限） */
  applicableExams?: ExamId[];
}

export interface Taxonomy {
  version: string;
  subject: TaxonomyItem;
  /** subject 级默认适用的卷种 */
  applicableExams?: ExamId[];
  chapters: TaxonomyItem[];
  problem_types: TaxonomyItem[];
  knowledge_points: TaxonomyItem[];
  methods: TaxonomyItem[];
  aliases?: Record<string, string[]>;
}

export interface Attempt {
  id: string;
  result: AttemptResult;
  note: string;
  createdAt: string;
}

/** 题目来源：真题 / 例题 / 自录 */
export interface ProblemSource {
  kind: "exam" | "example" | "custom";
  year?: number;
  paper?: ExamId;
  number?: number;
  book?: string;
  section?: string;
  license?: string;
}

export interface Problem {
  id: string;
  title: string;
  questionImages: string[];
  answerImages: string[];
  primaryChapterId: string;
  secondaryChapterIds: string[];
  primaryProblemTypeId: string;
  secondaryProblemTypeIds: string[];
  knowledgePointIds: string[];
  methodIds: string[];
  notes: string;
  createdAt: string;
  attempts: Attempt[];
  /** 含 $...$ / $$...$$ 的 LaTeX 题干文本（与图片二选一或并存） */
  questionText?: string;
  answerText?: string;
  origin: "builtin" | "user";
  difficulty?: 1 | 2 | 3 | 4 | 5;
  source?: ProblemSource;
}

export interface ProblemDraft extends Omit<Problem, "id" | "createdAt" | "attempts"> {}

export interface CustomTagInput {
  kind: TagKind;
  name: string;
  chapterId?: string;
  description?: string;
}
