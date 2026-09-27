import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, BookMarked, BookOpen, Check, ChevronRight, Clock3, Download, Edit3, ImagePlus,
  Library, Link2, Menu, Moon, Plus, RotateCcw, Save, Search, Sun, Tags, Upload, X, XCircle
} from "lucide-react";
import { addCustomTag, getTaxonomyFor, kindCollection, listSubjects } from "./taxonomy";
import { addAttempt, createProblem, exportBackup, importBackup, listProblems } from "./storage";
import { seedDefinitions, type DefinitionEntry } from "./definitions";
import "katex/dist/katex.min.css";
import type { AttemptResult, CustomTagInput, ExamId, Problem, ProblemDraft, ProblemSource, TagKind, Taxonomy, TaxonomyItem } from "./types";
import { FormulaText } from "./components/FormulaText";
import { FormulaInput } from "./components/FormulaInput";
import { BuiltinBadge, DifficultyBadge, SourceBadge } from "./components/ProblemBadges";
import {
  buildSource, examFilterOptions, examLabels, filterTaxonomyForExam, problemAppliesToExam,
  problemInSubject, sourceFormOf, sourceKindOf, sourceKindOptions, subjectApplies,
  type ExamFilter, type SourceFormState
} from "./components/filters";

type View = "library" | "review" | "glossary" | "tags" | "add" | "detail";

const subjectStorageKey = "mathlink.subject.v1";
const examFilterStorageKey = "mathlink.examFilter.v1";

/** 录入表单内部草稿：题干/答案文本在表单中恒为 string（空串 = 未填），保存时再归一为 undefined */
type ProblemFormDraft = Omit<ProblemDraft, "questionText" | "answerText"> & { questionText: string; answerText: string };

const emptyDraft = (): ProblemFormDraft => ({
  title: "", questionImages: [], answerImages: [], primaryChapterId: "",
  secondaryChapterIds: [], primaryProblemTypeId: "", secondaryProblemTypeIds: [],
  knowledgePointIds: [], methodIds: [], notes: "", origin: "user",
  questionText: "", answerText: ""
});

const resultLabel: Record<AttemptResult, string> = { correct: "做对了", wrong: "做错了", unfinished: "未完成" };

function readStoredSubject(): string {
  return localStorage.getItem(subjectStorageKey) || "calculus";
}

function readStoredExamFilter(): ExamFilter {
  const stored = localStorage.getItem(examFilterStorageKey);
  return examFilterOptions.some((option) => option.id === stored) ? (stored as ExamFilter) : "all";
}

function readImages(files: FileList | File[]): Promise<string[]> {
  return Promise.all(Array.from(files).filter((file) => file.type.startsWith("image/")).map((file) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    })
  ));
}

function names(ids: string[], items: TaxonomyItem[]) {
  return ids.map((id) => items.find((item) => item.id === id)?.name).filter(Boolean) as string[];
}

function similarity(a: Problem, b: Problem) {
  if (a.id === b.id) return 0;
  let score = 0;
  if (a.primaryProblemTypeId === b.primaryProblemTypeId) score += 8;
  score += Math.min(a.methodIds.filter((id) => b.methodIds.includes(id)).length * 4, 8);
  score += Math.min(a.knowledgePointIds.filter((id) => b.knowledgePointIds.includes(id)).length * 2, 6);
  if (a.primaryChapterId === b.primaryChapterId) score += 1;
  return score;
}

export default function App() {
  const [theme, setTheme] = useState<"light" | "dark">(() => (localStorage.getItem("mathlink.theme") === "dark" ? "dark" : "light"));
  const [view, setView] = useState<View>("library");
  const [mobileNav, setMobileNav] = useState(false);
  const [subjectId, setSubjectId] = useState<string>(readStoredSubject);
  const [examFilter, setExamFilter] = useState<ExamFilter>(readStoredExamFilter);
  const [taxonomyVersion, setTaxonomyVersion] = useState(0);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [query, setQuery] = useState("");
  const [chapterFilter, setChapterFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState<"all" | ProblemSource["kind"]>("all");
  const [difficultyFilter, setDifficultyFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");

  const reload = async () => setProblems(await listProblems());
  useEffect(() => { void reload(); }, []);
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem("mathlink.theme", theme); }, [theme]);
  useEffect(() => { localStorage.setItem(subjectStorageKey, subjectId); }, [subjectId]);
  useEffect(() => { localStorage.setItem(examFilterStorageKey, examFilter); }, [examFilter]);

  /** 当前卷种视角下可选科目（数二视角下概率科目整体隐藏，由 subject 级打标驱动） */
  const subjects = useMemo(() => listSubjects().filter((subject) => subjectApplies(subject, examFilter)), [examFilter]);
  useEffect(() => {
    if (subjects.length && !subjects.some((subject) => subject.id === subjectId)) setSubjectId(subjects[0].id);
  }, [subjects, subjectId]);

  /** 当前科目大纲（含自定义标签合并）；自定义标签变化时 bump taxonomyVersion 触发重算 */
  const taxonomy = useMemo(() => getTaxonomyFor(subjectId), [subjectId, taxonomyVersion]);
  const refreshTaxonomy = () => setTaxonomyVersion((version) => version + 1);
  /** 章节树/筛选器使用的卷种过滤后大纲 */
  const visibleTaxonomy = useMemo(() => filterTaxonomyForExam(taxonomy, examFilter), [taxonomy, examFilter]);
  useEffect(() => {
    if (chapterFilter !== "all" && !visibleTaxonomy.chapters.some((chapter) => chapter.id === chapterFilter)) setChapterFilter("all");
  }, [visibleTaxonomy, chapterFilter]);

  /** 当前科目内的题目，再按卷种（标签并集）收窄 */
  const subjectProblems = useMemo(() => problems.filter((problem) => problemInSubject(problem, taxonomy)), [problems, taxonomy]);
  const scopedProblems = useMemo(
    () => subjectProblems.filter((problem) => problemAppliesToExam(problem, taxonomy, examFilter)),
    [subjectProblems, taxonomy, examFilter]
  );
  const years = useMemo(() => [...new Set(
    scopedProblems.map((problem) => problem.source?.year).filter((year): year is number => typeof year === "number")
  )].sort((a, b) => b - a), [scopedProblems]);

  const filtered = useMemo(() => scopedProblems.filter((problem) => {
    const blob = [problem.title, problem.notes, problem.questionText,
      ...names(problem.knowledgePointIds, taxonomy.knowledge_points),
      ...names(problem.methodIds, taxonomy.methods)
    ].join(" ").toLowerCase();
    return (chapterFilter === "all" || problem.primaryChapterId === chapterFilter)
      && (sourceFilter === "all" || sourceKindOf(problem) === sourceFilter)
      && (difficultyFilter === "all" || String(problem.difficulty ?? "") === difficultyFilter)
      && (yearFilter === "all" || String(problem.source?.year ?? "") === yearFilter)
      && blob.includes(query.trim().toLowerCase());
  }), [scopedProblems, taxonomy, query, chapterFilter, sourceFilter, difficultyFilter, yearFilter]);

  const selected = problems.find((problem) => problem.id === selectedId);
  const openProblem = (id: string) => { setSelectedId(id); setView("detail"); setMobileNav(false); };
  const navigate = (next: View) => { setView(next); setSelectedId(undefined); setMobileNav(false); };
  const scopeLabel = `${taxonomy.subject.name}${examFilter === "all" ? "" : ` · ${examLabels[examFilter]}视角`}`;

  return (
    <div className="app-shell">
      <Sidebar view={view} count={scopedProblems.length} subjects={subjects} subjectId={subjectId} onSubject={setSubjectId}
        examFilter={examFilter} onExam={setExamFilter} open={mobileNav} navigate={navigate} close={() => setMobileNav(false)}
        theme={theme} toggleTheme={() => setTheme(theme === "light" ? "dark" : "light")}
        onImported={async () => { await reload(); refreshTaxonomy(); }} />
      <main className="main-area">
        <header className="mobile-header">
          <button className="icon-button" onClick={() => setMobileNav(true)} aria-label="打开导航"><Menu size={20} /></button>
          <strong>题间</strong>
          <div className="mobile-actions"><button className="icon-button" onClick={() => setTheme(theme === "light" ? "dark" : "light")} aria-label="切换主题">{theme === "light" ? <Moon size={18} /> : <Sun size={18} />}</button><button className="icon-button dark" onClick={() => navigate("add")} aria-label="添加题目"><Plus size={20} /></button></div>
        </header>
        {view === "library" && <LibraryView problems={filtered} scopedProblems={scopedProblems} taxonomy={visibleTaxonomy} scopeLabel={scopeLabel}
          query={query} setQuery={setQuery} chapterFilter={chapterFilter} setChapterFilter={setChapterFilter}
          sourceFilter={sourceFilter} setSourceFilter={setSourceFilter} difficultyFilter={difficultyFilter} setDifficultyFilter={setDifficultyFilter}
          yearFilter={yearFilter} setYearFilter={setYearFilter} years={years} openProblem={openProblem} onAdd={() => navigate("add")} />}
        {view === "add" && <AddView key={subjectId} taxonomy={taxonomy} refreshTaxonomy={refreshTaxonomy} onCancel={() => navigate("library")} onSave={async (draft) => { const problem = await createProblem(draft); await reload(); openProblem(problem.id); }} />}
        {view === "detail" && selected && <DetailView problem={selected} problems={scopedProblems} taxonomy={taxonomy} goBack={() => navigate("library")} openProblem={openProblem} onAttempt={async (result, note) => { await addAttempt(selected.id, result, note); await reload(); }} />}
        {view === "review" && <ReviewView problems={scopedProblems} taxonomy={taxonomy} openProblem={openProblem} />}
        {view === "glossary" && <GlossaryView taxonomy={taxonomy} />}
        {view === "tags" && <TagsView key={subjectId} taxonomy={taxonomy} refresh={refreshTaxonomy} />}
      </main>
    </div>
  );
}

function Sidebar({ view, count, subjects, subjectId, onSubject, examFilter, onExam, open, navigate, close, theme, toggleTheme, onImported }: {
  view: View; count: number; subjects: TaxonomyItem[]; subjectId: string; onSubject: (id: string) => void;
  examFilter: ExamFilter; onExam: (exam: ExamFilter) => void; open: boolean; navigate: (v: View) => void;
  close: () => void; theme: "light" | "dark"; toggleTheme: () => void; onImported: () => Promise<void>;
}) {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);
  const importFile = async (file: File) => {
    setImporting(true);
    try {
      const stats = await importBackup(await file.text());
      await onImported();
      window.alert(`导入完成：新增 ${stats.imported} 题，跳过已存在 ${stats.skipped} 题`);
    } catch (error) {
      window.alert(`导入失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setImporting(false);
    }
  };
  const nav = [
    { id: "library" as View, label: "题库", icon: Library },
    { id: "review" as View, label: "复习", icon: RotateCcw },
    { id: "glossary" as View, label: "定义索引", icon: BookMarked },
    { id: "tags" as View, label: "标签管理", icon: Tags }
  ];
  const backup = async () => {
    setExporting(true);
    try {
      const blob = new Blob([await exportBackup()], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `题间完整备份-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      window.alert(`导出失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setExporting(false);
    }
  };
  return <>
    {open && <button className="nav-scrim" onClick={close} aria-label="关闭导航" />}
    <aside className={`sidebar ${open ? "open" : ""}`}>
      <div className="brand"><span className="brand-mark">∑</span><span className="brand-copy"><strong>题间</strong><small>MathLink</small></span></div>
      <div className="scope-pickers">
        <div className="scope-block">
          <span className="scope-label">科目</span>
          <div className="scope-options">{subjects.map((subject) =>
            <button key={subject.id} className={subject.id === subjectId ? "active" : ""} onClick={() => onSubject(subject.id)} title={subject.description || subject.name}>{subject.name}</button>)}</div>
        </div>
        <div className="scope-block">
          <span className="scope-label">卷种</span>
          <div className="scope-options">{examFilterOptions.map(({ id, label }) =>
            <button key={id} className={id === examFilter ? "active" : ""} onClick={() => onExam(id)}>{label}</button>)}</div>
        </div>
      </div>
      <nav>
        {nav.map(({ id, label, icon: Icon }) => <button key={id} className={view === id || (view === "detail" && id === "library") ? "active" : ""} onClick={() => navigate(id)}><Icon size={18} /><span>{label}</span>{id === "library" && <small>{count}</small>}</button>)}
      </nav>
      <button className="add-primary" onClick={() => navigate("add")}><Plus size={18} />添加题目</button>
      <div className="sidebar-foot">
        <button onClick={toggleTheme}>{theme === "light" ? <Moon size={17} /> : <Sun size={17} />}切换为{theme === "light" ? "深色" : "浅色"}</button>
        <button onClick={() => void backup()} disabled={exporting}><Download size={17} />{exporting ? "正在导出…" : "导出完整备份"}</button>
        <button onClick={() => importInput.current?.click()} disabled={importing || exporting}><Upload size={17} />{importing ? "正在导入…" : "导入备份 / 题库包"}</button>
        <input ref={importInput} type="file" accept="application/json,.json" hidden
          onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); event.target.value = ""; }} />
      </div>
    </aside>
  </>;
}

function LibraryView({ problems, scopedProblems, taxonomy, scopeLabel, query, setQuery, chapterFilter, setChapterFilter, sourceFilter, setSourceFilter, difficultyFilter, setDifficultyFilter, yearFilter, setYearFilter, years, openProblem, onAdd }: {
  problems: Problem[]; scopedProblems: Problem[]; taxonomy: Taxonomy; scopeLabel: string;
  query: string; setQuery: (v: string) => void; chapterFilter: string; setChapterFilter: (v: string) => void;
  sourceFilter: "all" | ProblemSource["kind"]; setSourceFilter: (v: "all" | ProblemSource["kind"]) => void;
  difficultyFilter: string; setDifficultyFilter: (v: string) => void; yearFilter: string; setYearFilter: (v: string) => void;
  years: number[]; openProblem: (id: string) => void; onAdd: () => void;
}) {
  const chapterCounts = new Map(taxonomy.chapters.map((chapter) => [chapter.id, 0]));
  for (const problem of scopedProblems) chapterCounts.set(problem.primaryChapterId, (chapterCounts.get(problem.primaryChapterId) ?? 0) + 1);
  const hasActiveFilter = Boolean(query) || chapterFilter !== "all" || sourceFilter !== "all" || difficultyFilter !== "all" || yearFilter !== "all";
  return <div className="page library-page">
    <div className="page-heading"><div><p className="eyebrow">个人题库</p><h1>我的题目</h1><p>{scopeLabel} · 按题型、知识点和方法整理与回顾。</p></div><button className="primary desktop-only" onClick={onAdd}><Plus size={18} />添加题目</button></div>
    <div className="library-overview" aria-label="题库概览">
      <div><strong>{problems.length}</strong><span>当前题目</span></div>
      <i />
      <div><strong>{new Set(problems.map((problem) => problem.primaryProblemTypeId)).size}</strong><span>涉及题型</span></div>
      <i />
      <div><strong>{problems.filter((problem) => problem.attempts[0]?.result === "wrong").length}</strong><span>最近错题</span></div>
      <p><Link2 size={15} />标签越完整，相关题目的连接越准确</p>
    </div>
    <div className="chapter-rail" aria-label="章节树">
      <button className={chapterFilter === "all" ? "active" : ""} onClick={() => setChapterFilter("all")}>全部章节<span>{scopedProblems.length}</span></button>
      {taxonomy.chapters.map((chapter) => <button key={chapter.id} className={chapterFilter === chapter.id ? "active" : ""} onClick={() => setChapterFilter(chapter.id)} title={chapter.description || chapter.name}>{chapter.name}<span>{chapterCounts.get(chapter.id) ?? 0}</span></button>)}
    </div>
    <div className="filter-bar">
      <label className="search"><Search size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索标题、题干或备注" /></label>
      <select value={chapterFilter} onChange={(e) => setChapterFilter(e.target.value)} aria-label="筛选章节"><option value="all">全部章节</option>{taxonomy.chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.name}</option>)}</select>
      <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as "all" | ProblemSource["kind"])} aria-label="筛选来源"><option value="all">全部来源</option>{sourceKindOptions.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}</select>
      <select value={difficultyFilter} onChange={(e) => setDifficultyFilter(e.target.value)} aria-label="筛选难度"><option value="all">全部难度</option>{[1, 2, 3, 4, 5].map((level) => <option key={level} value={String(level)}>难度 {level}/5</option>)}</select>
      {years.length > 0 && <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} aria-label="筛选年份"><option value="all">全部年份</option>{years.map((year) => <option key={year} value={String(year)}>{year} 年</option>)}</select>}
    </div>
    {problems.length ? <div className="problem-grid">{problems.map((problem) => <ProblemCard key={problem.id} problem={problem} taxonomy={taxonomy} onClick={() => openProblem(problem.id)} />)}</div> : <div className="empty-state"><div className="empty-visual" aria-hidden="true"><span>∫</span><span>lim</span><span>∑</span><i /></div><h2>{hasActiveFilter ? "没有符合条件的题目" : "从第一道题开始"}</h2><p>{hasActiveFilter ? "尝试调整搜索词、章节或来源等筛选。" : "上传题图或输入题干文本并选择标签，之后就能沿着题型、知识点和方法找到相关题目。"}</p>{!hasActiveFilter && <button className="primary" onClick={onAdd}><ImagePlus size={18} />添加题目</button>}</div>}
  </div>;
}

function ProblemCard({ problem, taxonomy, onClick }: { problem: Problem; taxonomy: Taxonomy; onClick: () => void }) {
  const chapter = taxonomy.chapters.find((item) => item.id === problem.primaryChapterId)?.name;
  const type = taxonomy.problem_types.find((item) => item.id === problem.primaryProblemTypeId)?.name;
  const last = problem.attempts[0];
  return <button className="problem-card" onClick={onClick}>
    <div className="thumb">{problem.questionImages[0]
      ? <img src={problem.questionImages[0]} alt="题目缩略图" />
      : problem.questionText
        ? <div className="thumb-text"><FormulaText text={problem.questionText.slice(0, 400)} /></div>
        : <BookOpen />}</div>
    <div className="problem-card-body"><div className="card-meta"><span>{chapter}</span>{last && <span className={`result-dot ${last.result}`}>{resultLabel[last.result]}</span>}</div><h3>{problem.title || type || "未命名题目"}</h3><div className="tag-row"><span>{type}</span>{names(problem.knowledgePointIds, taxonomy.knowledge_points).slice(0, 2).map((name) => <span key={name}>{name}</span>)}</div>
      <div className="card-badges"><SourceBadge source={problem.source} /><DifficultyBadge difficulty={problem.difficulty} />{problem.origin === "builtin" && <BuiltinBadge />}</div></div>
  </button>;
}

function AddView({ taxonomy, refreshTaxonomy, onCancel, onSave }: { taxonomy: Taxonomy; refreshTaxonomy: () => void; onCancel: () => void; onSave: (draft: ProblemDraft) => Promise<void> }) {
  const [draft, setDraft] = useState<ProblemFormDraft>(emptyDraft);
  const [sourceForm, setSourceForm] = useState<SourceFormState>(() => sourceFormOf("none"));
  const [difficulty, setDifficulty] = useState("");
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const questionInput = useRef<HTMLInputElement>(null);
  const answerInput = useRef<HTMLInputElement>(null);
  const update = <K extends keyof ProblemFormDraft>(key: K, value: ProblemFormDraft[K]) => setDraft((old) => ({ ...old, [key]: value }));
  const attach = async (kind: "questionImages" | "answerImages", files: FileList | File[]) => update(kind, [...draft[kind], ...await readImages(files)]);
  useEffect(() => {
    const paste = (event: ClipboardEvent) => { if (step === 1 && event.clipboardData?.files.length) void attach("questionImages", event.clipboardData.files); };
    window.addEventListener("paste", paste); return () => window.removeEventListener("paste", paste);
  });
  const chapterTypes = taxonomy.problem_types.filter((item) => item.chapter_id === draft.primaryChapterId);
  const chapterKnowledge = taxonomy.knowledge_points.filter((item) => item.chapter_id === draft.primaryChapterId);
  // 必填校验：题干文本或图片至少其一（名称与主章节/主题型校验保持原状）
  const hasQuestion = draft.questionImages.length > 0 || draft.questionText.trim().length > 0;
  const canContinue = step === 1 ? hasQuestion : draft.primaryChapterId && draft.primaryProblemTypeId;
  const save = async () => {
    setSaving(true);
    try {
      await onSave({
        ...draft,
        questionText: draft.questionText.trim() || undefined,
        answerText: draft.answerText.trim() || undefined,
        source: buildSource(sourceForm),
        difficulty: difficulty ? (Number(difficulty) as 1 | 2 | 3 | 4 | 5) : undefined
      });
    } finally {
      setSaving(false);
    }
  };
  return <div className="page form-page">
    <div className="form-top"><button className="back-button" onClick={onCancel}><ArrowLeft size={18} />取消</button><div className="steps"><span className={step >= 1 ? "active" : ""}>1 题目</span><i /><span className={step >= 2 ? "active" : ""}>2 标注</span></div></div>
    {step === 1 ? <section className="form-section narrow"><p className="eyebrow">添加题目</p><h1>先放入题目内容</h1><p className="section-lead">上传图片或直接输入文本均可，也可以两者并存；文本支持 LaTeX 公式实时预览。新题默认为自建题目。</p>
      <ImageDropzone images={draft.questionImages} onFiles={(files) => void attach("questionImages", files)} remove={(index) => update("questionImages", draft.questionImages.filter((_, i) => i !== index))} inputRef={questionInput} label="题目图片" />
      <FormulaInput label="题干文本" hint="与图片至少填一项" value={draft.questionText} onChange={(value) => update("questionText", value)} placeholder="直接输入题干；行内公式用 $...$，独立公式用 $$...$$" />
      <label className="field"><span>题目标题 <small>选填</small></span><input value={draft.title} onChange={(e) => update("title", e.target.value)} placeholder="例如：含参数的函数极限" /></label>
      <div className="form-actions"><button className="primary" disabled={!canContinue} onClick={() => setStep(2)}>继续标注<ChevronRight size={18} /></button></div>
    </section> : <section className="form-section"><div className="section-title"><div><p className="eyebrow">结构化标注</p><h1>这道题与什么有关？</h1><p className="section-lead">只选你能确认的内容，知识点和方法都可以留空。</p></div><div className="mini-preview">{draft.questionImages[0]
      ? <><img src={draft.questionImages[0]} alt="题目预览" /><span>{draft.questionImages.length} 张</span></>
      : draft.questionText.trim() ? <div className="mini-text"><FormulaText text={draft.questionText} /></div> : null}</div></div>
      <div className="form-grid">
        <div className="field-group"><h2>主要位置</h2><label className="field"><span>章节</span><select value={draft.primaryChapterId} onChange={(e) => { update("primaryChapterId", e.target.value); update("primaryProblemTypeId", ""); update("knowledgePointIds", []); }}><option value="">选择章节</option>{taxonomy.chapters.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="field"><span>主题型</span><select value={draft.primaryProblemTypeId} disabled={!draft.primaryChapterId} onChange={(e) => update("primaryProblemTypeId", e.target.value)}><option value="">选择题型</option>{chapterTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
        <div className="field-group"><TagPicker title="知识点" hint="可多选" kind="knowledge_point" items={chapterKnowledge} selected={draft.knowledgePointIds} onChange={(ids) => update("knowledgePointIds", ids)} chapterId={draft.primaryChapterId} refresh={refreshTaxonomy} /><TagPicker title="方法" hint="做过后也可以再补" kind="method" items={taxonomy.methods} selected={draft.methodIds} onChange={(ids) => update("methodIds", ids)} refresh={refreshTaxonomy} /></div>
        <div className="field-group"><h2>答案与备注</h2><ImageDropzone compact images={draft.answerImages} onFiles={(files) => void attach("answerImages", files)} remove={(index) => update("answerImages", draft.answerImages.filter((_, i) => i !== index))} inputRef={answerInput} label="答案图片（选填）" /><FormulaInput label="答案文本" hint="选填" value={draft.answerText} onChange={(value) => update("answerText", value)} rows={4} /><label className="field"><span>备注 <small>选填</small></span><textarea value={draft.notes} onChange={(e) => update("notes", e.target.value)} placeholder="容易出错的地方或其他记录" /></label></div>
        <div className="field-group span-row"><h2>来源与难度 <small>选填</small></h2>
          <div className="source-fields">
            <label className="field"><span>来源类型</span><select value={sourceForm.kind} onChange={(e) => setSourceForm(sourceFormOf(e.target.value))}><option value="none">不设置</option><option value="exam">真题</option><option value="example">例题</option><option value="custom">自录</option></select></label>
            <label className="field"><span>难度</span><select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}><option value="">未设置</option>{[1, 2, 3, 4, 5].map((level) => <option key={level} value={String(level)}>{"★".repeat(level)}（{level}/5）</option>)}</select></label>
          </div>
          {sourceForm.kind === "exam" && <div className="source-fields">
            <label className="field"><span>年份</span><input type="number" min={1987} max={2100} value={sourceForm.year} onChange={(e) => setSourceForm({ ...sourceForm, year: e.target.value })} placeholder="2020" /></label>
            <label className="field"><span>卷别</span><select value={sourceForm.paper} onChange={(e) => setSourceForm({ ...sourceForm, paper: e.target.value as ExamId })}>{(Object.keys(examLabels) as ExamId[]).map((id) => <option key={id} value={id}>{examLabels[id]}</option>)}</select></label>
            <label className="field"><span>题号</span><input type="number" min={1} value={sourceForm.number} onChange={(e) => setSourceForm({ ...sourceForm, number: e.target.value })} placeholder="9" /></label>
          </div>}
          {sourceForm.kind === "example" && <div className="source-fields">
            <label className="field"><span>书名</span><input value={sourceForm.book} onChange={(e) => setSourceForm({ ...sourceForm, book: e.target.value })} placeholder="例如：Active Calculus" /></label>
            <label className="field"><span>章节</span><input value={sourceForm.section} onChange={(e) => setSourceForm({ ...sourceForm, section: e.target.value })} placeholder="例如：§4.2" /></label>
            <label className="field"><span>许可</span><input value={sourceForm.license} onChange={(e) => setSourceForm({ ...sourceForm, license: e.target.value })} placeholder="例如：CC BY-SA 4.0" /></label>
          </div>}
        </div>
      </div>
      <div className="form-actions split"><button className="secondary" onClick={() => setStep(1)}><ArrowLeft size={18} />上一步</button><button className="primary" disabled={!canContinue || saving} onClick={() => void save()}>{saving ? "保存中…" : "保存题目"}<Check size={18} /></button></div>
    </section>}
  </div>;
}

function ImageDropzone({ images, onFiles, remove, inputRef, label, compact = false }: { images: string[]; onFiles: (files: FileList) => void; remove: (index: number) => void; inputRef: React.RefObject<HTMLInputElement | null>; label: string; compact?: boolean }) {
  return <div className={`drop-wrap ${compact ? "compact" : ""}`}><input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(e) => e.target.files && onFiles(e.target.files)} />
    {images.length ? <div className="image-list">{images.map((image, index) => <div className="image-preview" key={`${image.slice(-20)}-${index}`}><img src={image} alt={`${label} ${index + 1}`} /><button className="remove-image" onClick={() => remove(index)} aria-label="移除图片"><X size={16} /></button></div>)}<button className="add-image-tile" onClick={() => inputRef.current?.click()} aria-label="继续添加图片"><Plus size={22} /><span>继续添加</span></button></div> : <button className="dropzone" onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onFiles(e.dataTransfer.files); }}><ImagePlus size={compact ? 22 : 30} /><strong>{label}</strong><span>{compact ? "点击上传" : "拖放、选择文件或粘贴截图"}</span></button>}
  </div>;
}

function TagPicker({ title, hint, kind, items, selected, onChange, chapterId, refresh }: { title: string; hint: string; kind: TagKind; items: TaxonomyItem[]; selected: string[]; onChange: (ids: string[]) => void; chapterId?: string; refresh: () => void }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  const add = () => {
    if (!name.trim() || (kind !== "method" && !chapterId)) return;
    const item = addCustomTag({ kind, name, chapterId }); refresh(); onChange([...selected, item.id]); setName(""); setAdding(false);
  };
  return <div className="tag-picker"><div className="picker-title"><h2>{title}</h2><span>{hint}</span></div><div className="chips">{items.map((item) => <button type="button" key={item.id} className={selected.includes(item.id) ? "selected" : ""} onClick={() => toggle(item.id)}>{selected.includes(item.id) && <Check size={13} />}{item.name}{item.origin === "user" && <i>自定义</i>}</button>)}<button type="button" className="new-tag" disabled={kind !== "method" && !chapterId} onClick={() => setAdding(true)}><Plus size={14} />新建</button></div>{adding && <div className="inline-create"><input autoFocus maxLength={40} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder={`新${title}名称`} /><button className="icon-button" onClick={add} aria-label="确认"><Check size={17} /></button><button className="icon-button" onClick={() => setAdding(false)} aria-label="取消"><X size={17} /></button></div>}</div>;
}

function DetailView({ problem, problems, taxonomy, goBack, openProblem, onAttempt }: { problem: Problem; problems: Problem[]; taxonomy: Taxonomy; goBack: () => void; openProblem: (id: string) => void; onAttempt: (result: AttemptResult, note: string) => Promise<void> }) {
  const [showAnswer, setShowAnswer] = useState(false);
  const [attempting, setAttempting] = useState(false);
  const [note, setNote] = useState("");
  const related = problems.map((candidate) => ({ candidate, score: similarity(problem, candidate) })).filter((item) => item.score > 1).sort((a, b) => b.score - a.score).slice(0, 6);
  const chapter = taxonomy.chapters.find((item) => item.id === problem.primaryChapterId)?.name;
  const type = taxonomy.problem_types.find((item) => item.id === problem.primaryProblemTypeId)?.name;
  const hasAnswer = problem.answerImages.length > 0 || Boolean(problem.answerText?.trim());
  // builtin 只读：编辑/删除入口只允许出现在 origin === "user" 的题目上；
  // 内置题目（origin === "builtin"）不渲染任何编辑/删除按钮，但下方“记录练习”保持可用。
  const readonly = problem.origin === "builtin";
  const submit = async (result: AttemptResult) => { await onAttempt(result, note); setNote(""); setAttempting(false); };
  return <div className="page detail-page"><button className="back-button" onClick={goBack}><ArrowLeft size={18} />返回题库</button><div className="detail-layout"><article className="question-column"><div className="detail-heading"><div><p>{chapter} / {type}</p><h1>{problem.title || type}</h1><div className="detail-badges"><SourceBadge source={problem.source} /><DifficultyBadge difficulty={problem.difficulty} />{readonly && <BuiltinBadge verbose />}</div></div><span className="problem-id">#{problem.id.slice(0, 6).toUpperCase()}</span></div>
    {problem.questionText?.trim() && <div className="question-text"><FormulaText text={problem.questionText} /></div>}
    <div className="question-images">{problem.questionImages.map((image, i) => <img key={i} src={image} alt={`题目图片 ${i + 1}`} />)}</div>
    <div className="answer-section"><button className="answer-toggle" onClick={() => setShowAnswer(!showAnswer)} disabled={!hasAnswer}><span>{hasAnswer ? (showAnswer ? "隐藏答案" : "查看答案") : "尚未填写答案"}</span><ChevronRight className={showAnswer ? "rotated" : ""} size={18} /></button>{showAnswer && <div className="answer-body">{problem.answerText?.trim() && <div className="question-text"><FormulaText text={problem.answerText} /></div>}<div className="question-images answer-images">{problem.answerImages.map((image, i) => <img key={i} src={image} alt={`答案图片 ${i + 1}`} />)}</div></div>}</div>
    <section className="attempt-panel"><div><h2>记录这次练习</h2><p>先在纸上完成，再记录结果。</p></div>{attempting ? <div className="attempt-form"><textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="记录错误原因或解题感受（选填）" /><div><button className="result-button correct" onClick={() => void submit("correct")}><Check size={17} />做对了</button><button className="result-button wrong" onClick={() => void submit("wrong")}><XCircle size={17} />做错了</button><button className="result-button unfinished" onClick={() => void submit("unfinished")}><Clock3 size={17} />未完成</button></div></div> : <button className="primary" onClick={() => setAttempting(true)}><Plus size={17} />添加记录</button>}</section>
    {problem.attempts.length > 0 && <section className="history"><h2>练习记录</h2>{problem.attempts.map((attempt) => <div className="history-row" key={attempt.id}><span className={`attempt-icon ${attempt.result}`}>{attempt.result === "correct" ? <Check /> : attempt.result === "wrong" ? <X /> : <Clock3 />}</span><div><strong>{resultLabel[attempt.result]}</strong>{attempt.note && <p>{attempt.note}</p>}</div><time>{new Date(attempt.createdAt).toLocaleDateString("zh-CN")}</time></div>)}</section>}
  </article><aside className="inspector"><section><h2>题目标注</h2>{readonly && <div className="note-box readonly-note"><span>内置题目</span><p>来自内置题库，内容与标注只读；仍可正常记录练习。</p></div>}<LabelGroup label="题型" values={[type || ""]} /><LabelGroup label="知识点" values={names(problem.knowledgePointIds, taxonomy.knowledge_points)} /><LabelGroup label="方法" values={names(problem.methodIds, taxonomy.methods)} />{problem.notes && <div className="note-box"><span>备注</span><p>{problem.notes}</p></div>}</section><section><div className="side-title"><h2>相关题目</h2><Link2 size={17} /></div>{related.length ? related.map(({ candidate, score }) => <button className="related-row" key={candidate.id} onClick={() => openProblem(candidate.id)}><div><strong>{candidate.title || taxonomy.problem_types.find((item) => item.id === candidate.primaryProblemTypeId)?.name}</strong><span>{score >= 8 ? "同题型" : "共同标签"}</span></div><ChevronRight size={17} /></button>) : <div className="side-empty"><Link2 size={22} /><p>还没有相关题目</p><span>继续录入同类题后会显示在这里。</span></div>}</section></aside></div></div>;
}

function LabelGroup({ label, values }: { label: string; values: string[] }) { return <div className="label-group"><span>{label}</span>{values.length ? <div>{values.map((value) => <b key={value}>{value}</b>)}</div> : <em>暂未标注</em>}</div>; }

function ReviewView({ problems, taxonomy, openProblem }: { problems: Problem[]; taxonomy: Taxonomy; openProblem: (id: string) => void }) {
  const due = problems.filter((problem) => !problem.attempts.length || problem.attempts[0].result !== "correct");
  return <div className="page"><div className="page-heading"><div><p className="eyebrow">复习队列</p><h1>今天继续这些题</h1><p>未练习和最近没有做对的题目会出现在这里。</p></div><div className="stat-block"><strong>{due.length}</strong><span>待复习</span></div></div>{due.length ? <div className="review-list">{due.map((problem) => <button key={problem.id} onClick={() => openProblem(problem.id)}><div className="review-thumb">{problem.questionImages[0] && <img src={problem.questionImages[0]} alt="" />}</div><div><span>{taxonomy.chapters.find((item) => item.id === problem.primaryChapterId)?.name}</span><h3>{problem.title || taxonomy.problem_types.find((item) => item.id === problem.primaryProblemTypeId)?.name}</h3><p>{problem.attempts.length ? `上次：${resultLabel[problem.attempts[0].result]}` : "尚未练习"}</p></div><ChevronRight /></button>)}</div> : <div className="empty-state"><Check size={34} /><h2>暂时没有待复习题目</h2><p>新的错题和未完成题会出现在这里。</p></div>}</div>;
}

function GlossaryView({ taxonomy }: { taxonomy: Taxonomy }) {
  const storageKey = "mathlink.definitions.v1";
  const readEntries = (): DefinitionEntry[] => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (!stored) return seedDefinitions;
      const userEntries = JSON.parse(stored) as DefinitionEntry[];
      const userIds = new Set(userEntries.map((entry) => entry.id));
      return [...userEntries, ...seedDefinitions.filter((entry) => !userIds.has(entry.id))];
    } catch { return seedDefinitions; }
  };
  const [entries, setEntries] = useState<DefinitionEntry[]>(readEntries);
  const [query, setQuery] = useState("");
  const [chapterId, setChapterId] = useState("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [entryChapterId, setEntryChapterId] = useState("");
  const definitionInput = useRef<HTMLTextAreaElement>(null);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return entries.filter((entry) => chapterId === "all" || entry.chapterId === chapterId)
      .filter((entry) => !needle || `${entry.title} ${entry.content}`.toLowerCase().includes(needle))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [entries, query, chapterId]);
  const resetEditor = () => { setEditingId(null); setTitle(""); setContent(""); setEntryChapterId(""); };
  const saveEntry = () => {
    if (!title.trim() || !content.trim()) return;
    const nextEntry: DefinitionEntry = { id: editingId || crypto.randomUUID(), title: title.trim(), content: content.trim(), chapterId: entryChapterId, updatedAt: new Date().toISOString() };
    const next = editingId ? entries.map((entry) => entry.id === editingId ? nextEntry : entry) : [nextEntry, ...entries];
    localStorage.setItem(storageKey, JSON.stringify(next)); setEntries(next); resetEditor();
  };
  const editEntry = (entry: DefinitionEntry) => { setEditingId(entry.id); setTitle(entry.title); setContent(entry.content); setEntryChapterId(entry.chapterId); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const insertFormula = (template: string) => {
    const input = definitionInput.current;
    const start = input?.selectionStart ?? content.length;
    const end = input?.selectionEnd ?? content.length;
    setContent(`${content.slice(0, start)}${template}${content.slice(end)}`);
    requestAnimationFrame(() => { input?.focus(); const cursor = start + template.length; input?.setSelectionRange(cursor, cursor); });
  };
  return <div className="page glossary-page">
    <div className="page-heading"><div><p className="eyebrow">快速查阅</p><h1>定义索引</h1><p>记录需要反复回看的概念、定理和公式定义。</p></div><div className="index-count"><strong>{entries.length}</strong><span>条定义</span></div></div>
    <section className="definition-editor">
      <div className="editor-heading"><div><Edit3 size={18} /><strong>{editingId ? "编辑定义" : "写一条定义"}</strong></div>{editingId && <button className="text-button" onClick={resetEditor}>取消编辑</button>}</div>
      <div className="definition-fields"><input value={title} maxLength={60} onChange={(event) => setTitle(event.target.value)} placeholder="定义名称，例如：函数在一点连续" /><select value={entryChapterId} onChange={(event) => setEntryChapterId(event.target.value)}><option value="">不指定章节</option>{taxonomy.chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.name}</option>)}</select></div>
      <textarea ref={definitionInput} value={content} onChange={(event) => setContent(event.target.value)} placeholder="直接写下定义内容。行内公式用 $...$，独立公式用 $$...$$" />
      <div className="formula-toolbar" aria-label="公式模板">
        <span>插入</span>
        <button title="分式" onClick={() => insertFormula("$\\frac{a}{b}$")}>a/b</button>
        <button title="极限" onClick={() => insertFormula("$$\\lim_{x\\to0} f(x)$$")}>lim</button>
        <button title="定积分" onClick={() => insertFormula("$$\\int_a^b f(x)\\,dx$$")}>∫</button>
        <button title="无穷求和" onClick={() => insertFormula("$$\\sum_{n=1}^{\\infty} a_n$$")}>∑</button>
        <button title="二阶矩阵" onClick={() => insertFormula("$$\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}$$")}>[ ]</button>
      </div>
      <div className="formula-help"><span>公式示例</span><code>$f'(x)$</code><code>{"$$\\lim_{x\\to0} f(x)$$"}</code></div>
      {content.trim() && <div className="definition-preview"><span>预览</span><FormulaText text={content} /></div>}
      <div className="editor-actions"><span>{content.length} 字</span><button className="primary" disabled={!title.trim() || !content.trim()} onClick={saveEntry}><Save size={16} />{editingId ? "保存修改" : "保存定义"}</button></div>
    </section>
    <div className="glossary-toolbar">
      <label className="search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称或定义" />{query && <button className="clear-search" onClick={() => setQuery("")} aria-label="清除搜索"><X size={15} /></button>}</label>
      <select value={chapterId} onChange={(event) => setChapterId(event.target.value)} aria-label="筛选章节"><option value="all">全部章节</option>{taxonomy.chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.name}</option>)}</select>
    </div>
    {filtered.length ? <div className="glossary-list user-definitions">{filtered.map((entry) => <article className="glossary-row" key={entry.id}><div className="term-name"><h2>{entry.title}</h2><button className="edit-definition" onClick={() => editEntry(entry)} aria-label={`编辑${entry.title}`}><Edit3 size={14} /></button></div><div className="definition-content"><FormulaText text={entry.content} /></div><span className="term-chapter">{entry.chapterId ? taxonomy.chapters.find((chapter) => chapter.id === entry.chapterId)?.name : "未分类"}</span></article>)}</div> : <div className="empty-state compact-empty"><BookMarked size={30} /><h2>{entries.length ? "没有找到对应定义" : "还没有定义"}</h2><p>{entries.length ? "尝试更换关键词或章节。" : "在上方直接写下第一条定义，保存后就能快速检索。"}</p></div>}
  </div>;
}

function TagsView({ taxonomy, refresh }: { taxonomy: Taxonomy; refresh: () => void }) {
  const [kind, setKind] = useState<TagKind>("problem_type");
  const [chapterId, setChapterId] = useState(taxonomy.chapters[0]?.id ?? "");
  const [name, setName] = useState("");
  const items = taxonomy[kindCollection[kind]].filter((item) => kind === "method" || item.chapter_id === chapterId);
  const create = () => { if (!name.trim()) return; addCustomTag({ kind, name, chapterId: kind === "method" ? undefined : chapterId }); setName(""); refresh(); };
  return <div className="page"><div className="page-heading"><div><p className="eyebrow">标签管理</p><h1>维护你的分类方式</h1><p>自定义标签与内置标签一样参与筛选和关联。</p></div></div><div className="tag-manager"><div className="segmented">{(["problem_type", "knowledge_point", "method"] as TagKind[]).map((id) => <button className={kind === id ? "active" : ""} key={id} onClick={() => setKind(id)}>{id === "problem_type" ? "题型" : id === "knowledge_point" ? "知识点" : "方法"}</button>)}</div>{kind !== "method" && <select value={chapterId} onChange={(e) => setChapterId(e.target.value)}>{taxonomy.chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.name}</option>)}</select>}<div className="create-tag-row"><input maxLength={40} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} placeholder="新增一个标签" /><button className="primary" onClick={create}><Plus size={17} />添加</button></div><div className="tag-table"><div className="tag-table-head"><span>名称</span><span>来源</span><span>说明</span></div>{items.map((item) => <div className="tag-table-row" key={item.id}><strong>{item.name}</strong><span className={item.origin === "user" ? "custom-badge" : "builtin-badge"}>{item.origin === "user" ? "自定义" : "内置"}</span><p>{item.description || "暂无说明"}</p></div>)}</div></div></div>;
}
