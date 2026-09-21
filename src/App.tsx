import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive, ArrowLeft, BookMarked, BookOpen, Check, ChevronRight, CircleHelp, Clock3,
  Download, Edit3, ImagePlus, Library, Link2, Menu, Plus, RotateCcw, Save, Search,
  Settings2, Sun, Moon, Tags, X, XCircle
} from "lucide-react";
import { addCustomTag, getTaxonomy, kindCollection } from "./taxonomy";
import { addAttempt, createProblem, exportBackup, listProblems } from "./storage";
import { seedDefinitions, type DefinitionEntry } from "./definitions";
import katex from "katex";
import "katex/dist/katex.min.css";
import type { AttemptResult, CustomTagInput, Problem, ProblemDraft, TagKind, Taxonomy, TaxonomyItem } from "./types";

type View = "library" | "review" | "glossary" | "tags" | "add" | "detail";

const emptyDraft = (): ProblemDraft => ({
  title: "", questionImages: [], answerImages: [], primaryChapterId: "",
  secondaryChapterIds: [], primaryProblemTypeId: "", secondaryProblemTypeIds: [],
  knowledgePointIds: [], methodIds: [], notes: ""
});

const resultLabel: Record<AttemptResult, string> = { correct: "做对了", wrong: "做错了", unfinished: "未完成" };

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
  const [taxonomy, setTaxonomy] = useState<Taxonomy>(() => getTaxonomy());
  const [problems, setProblems] = useState<Problem[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [query, setQuery] = useState("");
  const [chapterFilter, setChapterFilter] = useState("all");

  const reload = async () => setProblems(await listProblems());
  useEffect(() => { void reload(); }, []);
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem("mathlink.theme", theme); }, [theme]);

  const selected = problems.find((problem) => problem.id === selectedId);
  const openProblem = (id: string) => { setSelectedId(id); setView("detail"); setMobileNav(false); };
  const navigate = (next: View) => { setView(next); setSelectedId(undefined); setMobileNav(false); };

  const filtered = useMemo(() => problems.filter((problem) => {
    const blob = [problem.title, problem.notes,
      ...names(problem.knowledgePointIds, taxonomy.knowledge_points),
      ...names(problem.methodIds, taxonomy.methods)
    ].join(" ").toLowerCase();
    return (chapterFilter === "all" || problem.primaryChapterId === chapterFilter)
      && blob.includes(query.trim().toLowerCase());
  }), [problems, query, chapterFilter, taxonomy]);

  return (
    <div className="app-shell">
      <Sidebar view={view} count={problems.length} open={mobileNav} navigate={navigate} close={() => setMobileNav(false)} theme={theme} toggleTheme={() => setTheme(theme === "light" ? "dark" : "light")} />
      <main className="main-area">
        <header className="mobile-header">
          <button className="icon-button" onClick={() => setMobileNav(true)} aria-label="打开导航"><Menu size={20} /></button>
          <strong>题间</strong>
          <div className="mobile-actions"><button className="icon-button" onClick={() => setTheme(theme === "light" ? "dark" : "light")} aria-label="切换主题">{theme === "light" ? <Moon size={18} /> : <Sun size={18} />}</button><button className="icon-button dark" onClick={() => navigate("add")} aria-label="添加题目"><Plus size={20} /></button></div>
        </header>
        {view === "library" && <LibraryView problems={filtered} taxonomy={taxonomy} query={query} setQuery={setQuery} chapterFilter={chapterFilter} setChapterFilter={setChapterFilter} openProblem={openProblem} onAdd={() => navigate("add")} />}
        {view === "add" && <AddView taxonomy={taxonomy} refreshTaxonomy={() => setTaxonomy(getTaxonomy())} onCancel={() => navigate("library")} onSave={async (draft) => { const problem = await createProblem(draft); await reload(); openProblem(problem.id); }} />}
        {view === "detail" && selected && <DetailView problem={selected} problems={problems} taxonomy={taxonomy} goBack={() => navigate("library")} openProblem={openProblem} onAttempt={async (result, note) => { await addAttempt(selected.id, result, note); await reload(); }} />}
        {view === "review" && <ReviewView problems={problems} taxonomy={taxonomy} openProblem={openProblem} />}
        {view === "glossary" && <GlossaryView taxonomy={taxonomy} />}
        {view === "tags" && <TagsView taxonomy={taxonomy} refresh={() => setTaxonomy(getTaxonomy())} />}
      </main>
    </div>
  );
}

function Sidebar({ view, count, open, navigate, close, theme, toggleTheme }: { view: View; count: number; open: boolean; navigate: (v: View) => void; close: () => void; theme: "light" | "dark"; toggleTheme: () => void }) {
  const nav = [
    { id: "library" as View, label: "题库", icon: Library },
    { id: "review" as View, label: "复习", icon: RotateCcw },
    { id: "glossary" as View, label: "定义索引", icon: BookMarked },
    { id: "tags" as View, label: "标签管理", icon: Tags }
  ];
  const backup = () => {
    const blob = new Blob([exportBackup()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `题间备份-${new Date().toISOString().slice(0, 10)}.json`; anchor.click();
    URL.revokeObjectURL(url);
  };
  return <>
    {open && <button className="nav-scrim" onClick={close} aria-label="关闭导航" />}
    <aside className={`sidebar ${open ? "open" : ""}`}>
      <div className="brand"><span className="brand-mark">∑</span><span className="brand-copy"><strong>题间</strong><small>MathLink</small></span></div>
      <nav>
        {nav.map(({ id, label, icon: Icon }) => <button key={id} className={view === id || (view === "detail" && id === "library") ? "active" : ""} onClick={() => navigate(id)}><Icon size={18} /><span>{label}</span>{id === "library" && <small>{count}</small>}</button>)}
      </nav>
      <button className="add-primary" onClick={() => navigate("add")}><Plus size={18} />添加题目</button>
      <div className="sidebar-foot">
        <button onClick={toggleTheme}>{theme === "light" ? <Moon size={17} /> : <Sun size={17} />}切换为{theme === "light" ? "深色" : "浅色"}</button>
        <button onClick={backup}><Download size={17} />导出备份</button>
      </div>
    </aside>
  </>;
}

function LibraryView({ problems, taxonomy, query, setQuery, chapterFilter, setChapterFilter, openProblem, onAdd }: {
  problems: Problem[]; taxonomy: Taxonomy; query: string; setQuery: (v: string) => void; chapterFilter: string; setChapterFilter: (v: string) => void; openProblem: (id: string) => void; onAdd: () => void;
}) {
  return <div className="page library-page">
    <div className="page-heading"><div><p className="eyebrow">个人题库</p><h1>我的题目</h1><p>按题型、知识点和方法整理与回顾。</p></div><button className="primary desktop-only" onClick={onAdd}><Plus size={18} />添加题目</button></div>
    <div className="library-overview" aria-label="题库概览">
      <div><strong>{problems.length}</strong><span>当前题目</span></div>
      <i />
      <div><strong>{new Set(problems.map((problem) => problem.primaryProblemTypeId)).size}</strong><span>涉及题型</span></div>
      <i />
      <div><strong>{problems.filter((problem) => problem.attempts[0]?.result === "wrong").length}</strong><span>最近错题</span></div>
      <p><Link2 size={15} />标签越完整，相关题目的连接越准确</p>
    </div>
    <div className="filter-bar">
      <label className="search"><Search size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索标题、知识点或备注" /></label>
      <select value={chapterFilter} onChange={(e) => setChapterFilter(e.target.value)} aria-label="筛选章节"><option value="all">全部章节</option>{taxonomy.chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.name}</option>)}</select>
    </div>
    {problems.length ? <div className="problem-grid">{problems.map((problem) => <ProblemCard key={problem.id} problem={problem} taxonomy={taxonomy} onClick={() => openProblem(problem.id)} />)}</div> : <div className="empty-state"><div className="empty-visual" aria-hidden="true"><span>∫</span><span>lim</span><span>∑</span><i /></div><h2>{query || chapterFilter !== "all" ? "没有符合条件的题目" : "从第一道题开始"}</h2><p>{query || chapterFilter !== "all" ? "尝试调整搜索词或章节筛选。" : "上传题图并选择标签，之后就能沿着题型、知识点和方法找到相关题目。"}</p>{!query && chapterFilter === "all" && <button className="primary" onClick={onAdd}><ImagePlus size={18} />上传题图</button>}</div>}
  </div>;
}

function ProblemCard({ problem, taxonomy, onClick }: { problem: Problem; taxonomy: Taxonomy; onClick: () => void }) {
  const chapter = taxonomy.chapters.find((item) => item.id === problem.primaryChapterId)?.name;
  const type = taxonomy.problem_types.find((item) => item.id === problem.primaryProblemTypeId)?.name;
  const last = problem.attempts[0];
  return <button className="problem-card" onClick={onClick}>
    <div className="thumb">{problem.questionImages[0] ? <img src={problem.questionImages[0]} alt="题目缩略图" /> : <BookOpen />}</div>
    <div className="problem-card-body"><div className="card-meta"><span>{chapter}</span>{last && <span className={`result-dot ${last.result}`}>{resultLabel[last.result]}</span>}</div><h3>{problem.title || type || "未命名题目"}</h3><div className="tag-row"><span>{type}</span>{names(problem.knowledgePointIds, taxonomy.knowledge_points).slice(0, 2).map((name) => <span key={name}>{name}</span>)}</div></div>
  </button>;
}

function AddView({ taxonomy, refreshTaxonomy, onCancel, onSave }: { taxonomy: Taxonomy; refreshTaxonomy: () => void; onCancel: () => void; onSave: (draft: ProblemDraft) => Promise<void> }) {
  const [draft, setDraft] = useState(emptyDraft);
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const questionInput = useRef<HTMLInputElement>(null);
  const answerInput = useRef<HTMLInputElement>(null);
  const update = <K extends keyof ProblemDraft>(key: K, value: ProblemDraft[K]) => setDraft((old) => ({ ...old, [key]: value }));
  const attach = async (kind: "questionImages" | "answerImages", files: FileList | File[]) => update(kind, [...draft[kind], ...await readImages(files)]);
  useEffect(() => {
    const paste = (event: ClipboardEvent) => { if (step === 1 && event.clipboardData?.files.length) void attach("questionImages", event.clipboardData.files); };
    window.addEventListener("paste", paste); return () => window.removeEventListener("paste", paste);
  });
  const chapterTypes = taxonomy.problem_types.filter((item) => item.chapter_id === draft.primaryChapterId);
  const chapterKnowledge = taxonomy.knowledge_points.filter((item) => item.chapter_id === draft.primaryChapterId);
  const canContinue = step === 1 ? draft.questionImages.length > 0 : draft.primaryChapterId && draft.primaryProblemTypeId;
  return <div className="page form-page">
    <div className="form-top"><button className="back-button" onClick={onCancel}><ArrowLeft size={18} />取消</button><div className="steps"><span className={step >= 1 ? "active" : ""}>1 题目</span><i /><span className={step >= 2 ? "active" : ""}>2 标注</span></div></div>
    {step === 1 ? <section className="form-section narrow"><p className="eyebrow">添加题目</p><h1>先放入题目图片</h1><p className="section-lead">支持拖放、选择文件或直接粘贴截图。一道题可以包含多张图片。</p>
      <ImageDropzone images={draft.questionImages} onFiles={(files) => void attach("questionImages", files)} remove={(index) => update("questionImages", draft.questionImages.filter((_, i) => i !== index))} inputRef={questionInput} label="题目图片" />
      <label className="field"><span>题目标题 <small>选填</small></span><input value={draft.title} onChange={(e) => update("title", e.target.value)} placeholder="例如：含参数的函数极限" /></label>
      <div className="form-actions"><button className="primary" disabled={!canContinue} onClick={() => setStep(2)}>继续标注<ChevronRight size={18} /></button></div>
    </section> : <section className="form-section"><div className="section-title"><div><p className="eyebrow">结构化标注</p><h1>这道题与什么有关？</h1><p className="section-lead">只选你能确认的内容，知识点和方法都可以留空。</p></div><div className="mini-preview"><img src={draft.questionImages[0]} alt="题目预览" /><span>{draft.questionImages.length} 张</span></div></div>
      <div className="form-grid">
        <div className="field-group"><h2>主要位置</h2><label className="field"><span>章节</span><select value={draft.primaryChapterId} onChange={(e) => { update("primaryChapterId", e.target.value); update("primaryProblemTypeId", ""); update("knowledgePointIds", []); }}><option value="">选择章节</option>{taxonomy.chapters.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="field"><span>主题型</span><select value={draft.primaryProblemTypeId} disabled={!draft.primaryChapterId} onChange={(e) => update("primaryProblemTypeId", e.target.value)}><option value="">选择题型</option>{chapterTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
        <div className="field-group"><TagPicker title="知识点" hint="可多选" kind="knowledge_point" items={chapterKnowledge} selected={draft.knowledgePointIds} onChange={(ids) => update("knowledgePointIds", ids)} chapterId={draft.primaryChapterId} refresh={refreshTaxonomy} /><TagPicker title="方法" hint="做过后也可以再补" kind="method" items={taxonomy.methods} selected={draft.methodIds} onChange={(ids) => update("methodIds", ids)} refresh={refreshTaxonomy} /></div>
        <div className="field-group"><h2>答案与备注</h2><ImageDropzone compact images={draft.answerImages} onFiles={(files) => void attach("answerImages", files)} remove={(index) => update("answerImages", draft.answerImages.filter((_, i) => i !== index))} inputRef={answerInput} label="答案图片（选填）" /><label className="field"><span>备注 <small>选填</small></span><textarea value={draft.notes} onChange={(e) => update("notes", e.target.value)} placeholder="来源、容易出错的地方或其他记录" /></label></div>
      </div>
      <div className="form-actions split"><button className="secondary" onClick={() => setStep(1)}><ArrowLeft size={18} />上一步</button><button className="primary" disabled={!canContinue || saving} onClick={async () => { setSaving(true); await onSave(draft); }}>{saving ? "保存中…" : "保存题目"}<Check size={18} /></button></div>
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
  const submit = async (result: AttemptResult) => { await onAttempt(result, note); setNote(""); setAttempting(false); };
  return <div className="page detail-page"><button className="back-button" onClick={goBack}><ArrowLeft size={18} />返回题库</button><div className="detail-layout"><article className="question-column"><div className="detail-heading"><div><p>{chapter} / {type}</p><h1>{problem.title || type}</h1></div><span className="problem-id">#{problem.id.slice(0, 6).toUpperCase()}</span></div><div className="question-images">{problem.questionImages.map((image, i) => <img key={i} src={image} alt={`题目图片 ${i + 1}`} />)}</div>
    <div className="answer-section"><button className="answer-toggle" onClick={() => setShowAnswer(!showAnswer)} disabled={!problem.answerImages.length}><span>{problem.answerImages.length ? (showAnswer ? "隐藏答案" : "查看答案") : "尚未上传答案"}</span><ChevronRight className={showAnswer ? "rotated" : ""} size={18} /></button>{showAnswer && <div className="question-images answer-images">{problem.answerImages.map((image, i) => <img key={i} src={image} alt={`答案图片 ${i + 1}`} />)}</div>}</div>
    <section className="attempt-panel"><div><h2>记录这次练习</h2><p>先在纸上完成，再记录结果。</p></div>{attempting ? <div className="attempt-form"><textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="记录错误原因或解题感受（选填）" /><div><button className="result-button correct" onClick={() => void submit("correct")}><Check size={17} />做对了</button><button className="result-button wrong" onClick={() => void submit("wrong")}><XCircle size={17} />做错了</button><button className="result-button unfinished" onClick={() => void submit("unfinished")}><Clock3 size={17} />未完成</button></div></div> : <button className="primary" onClick={() => setAttempting(true)}><Plus size={17} />添加记录</button>}</section>
    {problem.attempts.length > 0 && <section className="history"><h2>练习记录</h2>{problem.attempts.map((attempt) => <div className="history-row" key={attempt.id}><span className={`attempt-icon ${attempt.result}`}>{attempt.result === "correct" ? <Check /> : attempt.result === "wrong" ? <X /> : <Clock3 />}</span><div><strong>{resultLabel[attempt.result]}</strong>{attempt.note && <p>{attempt.note}</p>}</div><time>{new Date(attempt.createdAt).toLocaleDateString("zh-CN")}</time></div>)}</section>}
  </article><aside className="inspector"><section><h2>题目标注</h2><LabelGroup label="题型" values={[type || ""]} /><LabelGroup label="知识点" values={names(problem.knowledgePointIds, taxonomy.knowledge_points)} /><LabelGroup label="方法" values={names(problem.methodIds, taxonomy.methods)} />{problem.notes && <div className="note-box"><span>备注</span><p>{problem.notes}</p></div>}</section><section><div className="side-title"><h2>相关题目</h2><Link2 size={17} /></div>{related.length ? related.map(({ candidate, score }) => <button className="related-row" key={candidate.id} onClick={() => openProblem(candidate.id)}><div><strong>{candidate.title || taxonomy.problem_types.find((item) => item.id === candidate.primaryProblemTypeId)?.name}</strong><span>{score >= 8 ? "同题型" : "共同标签"}</span></div><ChevronRight size={17} /></button>) : <div className="side-empty"><Link2 size={22} /><p>还没有相关题目</p><span>继续录入同类题后会显示在这里。</span></div>}</section></aside></div></div>;
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

function FormulaText({ text }: { text: string }) {
  const parts = text.split(/(\$\$[\s\S]+?\$\$|\$[^\n$]+?\$)/g).filter(Boolean);
  return <>{parts.map((part, index) => {
    const display = part.startsWith("$$") && part.endsWith("$$");
    const inline = !display && part.startsWith("$") && part.endsWith("$");
    if (!display && !inline) return <span className="definition-prose" key={index}>{part}</span>;
    const formula = part.slice(display ? 2 : 1, display ? -2 : -1);
    const html = katex.renderToString(formula, { displayMode: display, throwOnError: false, strict: "ignore", trust: false });
    return <span className={display ? "formula-block" : "formula-inline"} key={index} dangerouslySetInnerHTML={{ __html: html }} />;
  })}</>;
}

function TagsView({ taxonomy, refresh }: { taxonomy: Taxonomy; refresh: () => void }) {
  const [kind, setKind] = useState<TagKind>("problem_type");
  const [chapterId, setChapterId] = useState(taxonomy.chapters[0].id);
  const [name, setName] = useState("");
  const items = taxonomy[kindCollection[kind]].filter((item) => kind === "method" || item.chapter_id === chapterId);
  const create = () => { if (!name.trim()) return; addCustomTag({ kind, name, chapterId: kind === "method" ? undefined : chapterId }); setName(""); refresh(); };
  return <div className="page"><div className="page-heading"><div><p className="eyebrow">标签管理</p><h1>维护你的分类方式</h1><p>自定义标签与内置标签一样参与筛选和关联。</p></div></div><div className="tag-manager"><div className="segmented">{(["problem_type", "knowledge_point", "method"] as TagKind[]).map((id) => <button className={kind === id ? "active" : ""} key={id} onClick={() => setKind(id)}>{id === "problem_type" ? "题型" : id === "knowledge_point" ? "知识点" : "方法"}</button>)}</div>{kind !== "method" && <select value={chapterId} onChange={(e) => setChapterId(e.target.value)}>{taxonomy.chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.name}</option>)}</select>}<div className="create-tag-row"><input maxLength={40} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} placeholder="新增一个标签" /><button className="primary" onClick={create}><Plus size={17} />添加</button></div><div className="tag-table"><div className="tag-table-head"><span>名称</span><span>来源</span><span>说明</span></div>{items.map((item) => <div className="tag-table-row" key={item.id}><strong>{item.name}</strong><span className={item.origin === "user" ? "custom-badge" : "builtin-badge"}>{item.origin === "user" ? "自定义" : "内置"}</span><p>{item.description || "暂无说明"}</p></div>)}</div></div></div>;
}
