import katex from "katex";

/**
 * 把含 $...$（行内）/ $$...$$（独立）公式的文本渲染为 KaTeX，
 * 其余部分按普通文本输出。题干/答案文本与定义索引共用此渲染约定。
 */
export function FormulaText({ text }: { text: string }) {
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
