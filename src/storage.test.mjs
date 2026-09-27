// storage.ts 的 node 自测驱动（浏览器/localStorage 路径）。
// 用法（先把 storage.ts 打包成 ESM，再用本脚本 + localStorage mock 运行）：
//   npx esbuild src/storage.ts --bundle --format=esm --outfile=/tmp/storage.test.mjs
//   node src/storage.test.mjs
import assert from "node:assert/strict";

// 简易 localStorage mock：需在动态导入打包产物之前就位
const backing = new Map();
globalThis.localStorage = {
  getItem: (key) => (backing.has(key) ? backing.get(key) : null),
  setItem: (key, value) => { backing.set(key, String(value)); },
  removeItem: (key) => { backing.delete(key); },
  clear: () => backing.clear()
};
// storage.ts 的 isTauri() 检查 window；指向 globalThis 让所有调用走浏览器分支
globalThis.window = globalThis;

const storage = await import("/tmp/storage.test.mjs");
const { listProblems, createProblem, importBackup, exportBackup } = storage;

const V1 = "mathlink.problems.v1";
const V2 = "mathlink.problems.v2";

const draft = (title) => ({
  title, questionImages: [], answerImages: [],
  primaryChapterId: "function_limit_continuity", secondaryChapterIds: [],
  primaryProblemTypeId: "pt.limit", secondaryProblemTypeIds: [],
  knowledgePointIds: [], methodIds: [], notes: "", origin: "user"
});

const legacyProblem = (id, title) => ({
  id, title, questionImages: [], answerImages: [],
  primaryChapterId: "function_limit_continuity", secondaryChapterIds: [],
  primaryProblemTypeId: "pt.limit", secondaryProblemTypeIds: [],
  knowledgePointIds: [], methodIds: [], notes: "",
  createdAt: `2025-01-0${id.slice(-1)}T00:00:00.000Z`, attempts: []
});

// ---------- 场景 1：v1 → v2 惰性迁移 ----------
{
  backing.clear();
  backing.set(V1, JSON.stringify([legacyProblem("old-1", "旧题一"), legacyProblem("old-2", "旧题二")]));
  const problems = await listProblems();
  assert.equal(problems.length, 2, "迁移后题目数量不变");
  assert.ok(problems.every((p) => p.origin === "user"), "每题应补 origin: \"user\"");
  assert.ok(backing.has(V2), "应写入 v2 key");
  assert.equal(JSON.parse(backing.get(V1))[0].origin, undefined, "v1 原数据保留不动（未补 origin）");
  assert.equal(backing.get(V1), JSON.stringify([legacyProblem("old-1", "旧题一"), legacyProblem("old-2", "旧题二")]), "v1 字符串完全未改");
  // v2 优先：v2 存在后即使 v1 变化也以 v2 为准
  backing.set(V2, JSON.stringify([{ ...legacyProblem("v2-only", "v2 题"), origin: "user" }]));
  backing.set(V1, JSON.stringify([legacyProblem("old-9", "v1 新题")]));
  const after = await listProblems();
  assert.deepEqual(after.map((p) => p.id), ["v2-only"], "v2 存在后永远以 v2 为准");
  // v1 缺失、v2 缺失：不产生 v2
  backing.clear();
  await listProblems();
  assert.ok(!backing.has(V2), "无 v1 时不产生 v2");
  console.log("场景 1 通过：v1→v2 惰性迁移（补 origin、v1 保留、v2 优先）");
}

// ---------- 场景 2：导出 → 导入闭环与幂等 ----------
{
  backing.clear();
  const created1 = await createProblem(draft("题目甲"));
  const created2 = await createProblem(draft("题目乙"));
  const payload = await exportBackup();
  const parsed = JSON.parse(payload);
  assert.equal(parsed.format, "mathlink-backup");
  assert.equal(parsed.version, 2);

  backing.clear(); // 模拟另一台设备
  const first = await importBackup(payload);
  assert.deepEqual(first, { imported: 2, skipped: 0 }, "首次导入应全部写入");
  const restored = await listProblems();
  assert.equal(restored.length, 2);
  assert.equal(restored.find((p) => p.id === created1.id)?.title, "题目甲", "导入内容完整");
  const second = await importBackup(payload);
  assert.deepEqual(second, { imported: 0, skipped: 2 }, "同一 payload 二次导入应全部跳过");
  assert.equal((await listProblems()).length, 2, "幂等：不产生重复题");
  console.log("场景 2 通过：导入幂等（第二次 imported=0）");
}

// ---------- 场景 3：已存在的 id 跳过、不覆盖 ----------
{
  backing.clear();
  await createProblem(draft("题目甲"));
  await createProblem(draft("题目乙"));
  const source = JSON.parse(await exportBackup()); // 甲、乙两题
  backing.clear(); // 换一台本地已有另一道题的设备
  const local = await createProblem(draft("本地旧标题"));
  const { problems } = source;
  const payload = JSON.stringify({
    ...source,
    problems: [
      { ...problems.find((p) => p.title === "题目甲"), id: local.id, title: "导入新标题" },
      { ...problems.find((p) => p.title === "题目乙"), id: "brand-new", title: "全新题目" }
    ]
  });
  const stats = await importBackup(payload);
  assert.deepEqual(stats, { imported: 1, skipped: 1 });
  const stored = await listProblems();
  assert.equal(stored.find((p) => p.id === local.id)?.title, "本地旧标题", "已存在 id 不被覆盖");
  assert.ok(stored.some((p) => p.id === "brand-new"), "新 id 正常写入");
  console.log("场景 3 通过：已存在 id 跳过不覆盖");
}

// ---------- 场景 3b：customTags / definitions 按 id 去重合流 ----------
{
  backing.clear();
  const tagPayload = JSON.stringify({
    format: "mathlink-backup", version: 2, problems: [],
    customTags: { problem_type: [{ id: "usr_tag1", name: "自建题型", origin: "user" }] },
    definitions: [{ id: "def-1", title: "导入定义", content: "$x$", chapterId: "c", updatedAt: "2026-01-01T00:00:00.000Z" }]
  });
  await importBackup(tagPayload);
  await importBackup(tagPayload);
  const tags = JSON.parse(backing.get("mathlink.custom-tags.v1"));
  assert.equal(tags.problem_type.filter((t) => t.id === "usr_tag1").length, 1, "customTags 按 id 去重");
  const defs = JSON.parse(backing.get("mathlink.definitions.v1"));
  assert.equal(defs.filter((d) => d.id === "def-1").length, 1, "definitions 按 id 去重");
  console.log("场景 3b 通过：customTags / definitions 按 id 去重");
}

// ---------- 场景 4：format / version / JSON 校验 ----------
{
  await assert.rejects(() => importBackup("{oops"), /备份.*JSON/);
  await assert.rejects(() => importBackup(JSON.stringify({ format: "other-app", version: 2, problems: [] })), /格式/);
  await assert.rejects(() => importBackup(JSON.stringify({ format: "mathlink-backup", version: 1, problems: [] })), /版本/);
  await assert.rejects(() => importBackup(JSON.stringify({ format: "mathlink-backup", version: 3, problems: [] })), /版本/);
  console.log("场景 4 通过：format / version / 非法 JSON 均抛中文错误");
}

console.log("全部自测通过");
