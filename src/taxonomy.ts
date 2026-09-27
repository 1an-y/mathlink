import source from "../data/calculus-taxonomy-v1.1.json";
import type { CustomTagInput, TagKind, Taxonomy, TaxonomyItem } from "./types";

const customKey = "mathlink.custom-tags.v1";

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

export function getTaxonomy(): Taxonomy {
  const custom = readCustom();
  return {
    ...(source as Taxonomy),
    problem_types: [...source.problem_types, ...custom.problem_type],
    knowledge_points: [...source.knowledge_points, ...custom.knowledge_point],
    methods: [...source.methods, ...custom.method]
  };
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
