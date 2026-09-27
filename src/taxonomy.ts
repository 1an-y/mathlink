import calculusSource from "../data/calculus-taxonomy-v1.2.json";
import linearAlgebraSource from "../data/linear-algebra-taxonomy-v1.json";
import probabilitySource from "../data/probability-taxonomy-v1.json";
import type { CustomTagInput, TagKind, Taxonomy, TaxonomyItem } from "./types";

const customKey = "mathlink.custom-tags.v1";

/** 默认科目：高等数学（保持 getTaxonomy() 原行为） */
export const defaultSubjectId = "calculus";

/** 各科目大纲数据源，listSubjects()/getTaxonomies() 按此顺序返回 */
const sources: Taxonomy[] = [
  calculusSource as Taxonomy,
  linearAlgebraSource as Taxonomy,
  probabilitySource as Taxonomy
];

/**
 * 自定义标签按 chapter_id 前缀归属科目：
 * 线性代数章节 id 带 "la." 前缀，概率论章节 id 带 "prob." 前缀，
 * 高等数学（含无章节归属的方法类标签）沿用旧 id 无前缀。
 */
const chapterPrefixSubjects: Array<[prefix: string, subjectId: string]> = [
  ["la.", "linear_algebra"],
  ["prob.", "probability_statistics"]
];

function subjectOfChapterId(chapterId?: string): string {
  if (!chapterId) return defaultSubjectId;
  for (const [prefix, subjectId] of chapterPrefixSubjects) {
    if (chapterId.startsWith(prefix)) return subjectId;
  }
  return defaultSubjectId;
}

function readCustom(): Record<TagKind, TaxonomyItem[]> {
  try {
    return JSON.parse(localStorage.getItem(customKey) || "") as Record<TagKind, TaxonomyItem[]>;
  } catch {
    return { problem_type: [], knowledge_point: [], method: [] };
  }
}

export function getCustomTags(): Record<TagKind, TaxonomyItem[]> {
  return readCustom();
}

function customTagsFor(subjectId: string): Record<TagKind, TaxonomyItem[]> {
  const custom = readCustom();
  const belongsToSubject = (item: TaxonomyItem) => subjectOfChapterId(item.chapter_id) === subjectId;
  return {
    problem_type: custom.problem_type.filter(belongsToSubject),
    knowledge_point: custom.knowledge_point.filter(belongsToSubject),
    method: custom.method.filter(belongsToSubject)
  };
}

function mergeCustomTags(source: Taxonomy): Taxonomy {
  const custom = customTagsFor(source.subject.id);
  return {
    ...source,
    problem_types: [...source.problem_types, ...custom.problem_type],
    knowledge_points: [...source.knowledge_points, ...custom.knowledge_point],
    methods: [...source.methods, ...custom.method]
  };
}

/** 全部科目（高等数学 / 线性代数 / 概率论与数理统计） */
export function listSubjects(): TaxonomyItem[] {
  return sources.map((source) => source.subject);
}

/** 每科一份 Taxonomy，各自合并本科目下的自定义标签 */
export function getTaxonomies(): Taxonomy[] {
  return sources.map(mergeCustomTags);
}

/** 取指定科目的大纲（含自定义标签合并）；未知 subjectId 回退为默认科目高等数学 */
export function getTaxonomyFor(subjectId: string): Taxonomy {
  const source = sources.find((item) => item.subject.id === subjectId) ?? sources[0];
  return mergeCustomTags(source);
}

/** 默认返回高等数学，含自定义标签合并（原有行为） */
export function getTaxonomy(): Taxonomy {
  return getTaxonomyFor(defaultSubjectId);
}

export function addCustomTag(input: CustomTagInput): TaxonomyItem {
  const custom = readCustom();
  const item: TaxonomyItem = {
    id: `usr_${crypto.randomUUID()}`,
    name: input.name.trim(),
    chapter_id: input.chapterId,
    description: input.description?.trim(),
    origin: "user"
  };
  custom[input.kind] = [...custom[input.kind], item];
  localStorage.setItem(customKey, JSON.stringify(custom));
  return item;
}

export const kindCollection = {
  problem_type: "problem_types",
  knowledge_point: "knowledge_points",
  method: "methods"
} as const;
