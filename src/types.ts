export type TagKind = "problem_type" | "knowledge_point" | "method";
export type AttemptResult = "correct" | "wrong" | "unfinished";

export interface TaxonomyItem {
  id: string;
  name: string;
  chapter_id?: string;
  description?: string;
  origin?: "builtin" | "user";
}

export interface Taxonomy {
  version: string;
  subject: TaxonomyItem;
  chapters: TaxonomyItem[];
  problem_types: TaxonomyItem[];
  knowledge_points: TaxonomyItem[];
  methods: TaxonomyItem[];
}

export interface Attempt {
  id: string;
  result: AttemptResult;
  note: string;
  createdAt: string;
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
}

export interface ProblemDraft extends Omit<Problem, "id" | "createdAt" | "attempts"> {}

export interface CustomTagInput {
  kind: TagKind;
  name: string;
  chapterId?: string;
  description?: string;
}
