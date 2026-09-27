import { useRef } from "react";
import { FormulaText } from "./FormulaText";

const templates: Array<{ label: string; title: string; template: string }> = [
  { label: "a/b", title: "分式", template: "$\\frac{a}{b}$" },
  { label: "lim", title: "极限", template: "$\\lim_{x\\to0} f(x)$" },
  { label: "∫", title: "定积分", template: "$$\\int_a^b f(x)\\,dx$$" },
  { label: "∑", title: "无穷求和", template: "$$\\sum_{n=1}^{\\infty} a_n$$" },
  { label: "[ ]", title: "二阶矩阵", template: "$$\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}$$" }
];

/** LaTeX 文本输入：textarea + 公式模板快捷插入 + 实时 KaTeX 预览（复用 FormulaText） */
export function FormulaInput({ label, hint, value, onChange, placeholder, rows = 5 }: {
  label: string; hint?: string; value: string; onChange: (value: string) => void; placeholder?: string; rows?: number;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  const insert = (template: string) => {
    const el = input.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    onChange(`${value.slice(0, start)}${template}${value.slice(end)}`);
    requestAnimationFrame(() => { el?.focus(); const cursor = start + template.length; el?.setSelectionRange(cursor, cursor); });
  };
  return <div className="latex-field">
    <div className="latex-field-head"><span>{label}</span>{hint && <small>{hint}</small>}</div>
    <textarea ref={input} rows={rows} value={value} onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder ?? "支持 LaTeX：行内公式用 $...$，独立公式用 $$...$$"} />
    <div className="formula-toolbar" aria-label="公式模板">
      <span>插入</span>
      {templates.map((item) => <button type="button" key={item.label} title={item.title} onClick={() => insert(item.template)}>{item.label}</button>)}
    </div>
    {value.trim() && <div className="latex-preview"><span>预览</span><FormulaText text={value} /></div>}
  </div>;
}
