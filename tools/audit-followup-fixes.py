# -*- coding: utf-8 -*-
"""真题审计跟进修复（按顺序重放）：
1) m1-2023.8 公式乱码/选项乱码修复并补解答
2) m2-1999.6 主章节改挂一元微分
3) m2-2020 删 4 道纯答案占位题、结论并入解答
4) 356 道空主章节题回填（打标多数票 → 关键词兜底）
5) 7 道跨科目/非法打标逐题修正
6) m3-2022.20 OCR 断杆 rac 精确修复
7) index.json 的 total/withAnswer 按校验器口径重算
"""
import json, glob, os, collections, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EX = os.path.join(ROOT, 'data', 'banks', 'exams')
os.chdir(ROOT)

def load(f): return json.load(open(f, encoding='utf-8'))
def save(f, d):
    json.dump(d, open(f, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    open(f, 'a', encoding='utf-8').write('\n')

def add_note(p, text):
    p['notes'] = (p['notes'] or '') + ('；' if p['notes'] else '') + text

# ---------- STEP 1: m1-2023.8 ----------
f = f'{EX}/math1/2023.json'
d = load(f)
p = next(x for x in d['problems'] if x['id'] == 'bank.exam.m1-2023.8')
p['questionText'] = (r"设随机变量 $X$ 服从参数为 1 的泊松分布，则 $E(|X-EX|)=$（　）" "\n\n"
                     r"A. $\dfrac{1}{e}$　　B. $\dfrac{1}{2}$　　C. $\dfrac{2}{e}$　　D. $1$")
p['answerText'] = (r"选 C。" "\n"
                   r"由 $EX=1$，$$E(|X-1|)=\sum_{k=0}^{\infty}|k-1|\,\frac{e^{-1}}{k!}=e^{-1}\left(1+0+\sum_{k=2}^{\infty}\frac{k-1}{k!}\right)$$"
                   r" 其中 $$\sum_{k=2}^{\infty}\frac{k-1}{k!}=\sum_{k=2}^{\infty}\frac{1}{(k-1)!}-\sum_{k=2}^{\infty}\frac{1}{k!}=(e-1)-(e-2)=1$$"
                   r" 故 $E(|X-1|)=\dfrac{2}{e}$。" "\n"
                   r"（一般结论：$X\sim\pi(\lambda)$ 时 $E|X-\lambda|=2\lambda\,P(X=\lfloor\lambda\rfloor)$，本题 $\lambda=1$ 时为 $2e^{-1}$。）")
add_note(p, '审计修复：原题面公式为 PDF 抽取乱码（array 残片）、选项 A/C 乱码，已按 2023 年数一真题原貌重写并补全解答（原答案栏为「待校对」占位）')
save(f, d); print('STEP1 m1-2023.8 ok')

# ---------- STEP 2: m2-1999.6 ----------
f = f'{EX}/math2/1999.json'
d = load(f)
p = next(x for x in d['problems'] if x['id'] == 'bank.exam.m2-1999.6')
assert p['primaryChapterId'] == 'multivariable_differential'
p['primaryChapterId'] = 'one_variable_differential'
add_note(p, '审计修复：主章节原误挂 multivariable_differential，题面为一元分段函数在 x=0 处的连续性与可导性，改挂 one_variable_differential')
save(f, d); print('STEP2 m2-1999.6 ok')

# ---------- STEP 3: m2-2020 ----------
f = f'{EX}/math2/2020.json'
d = load(f)
probs = {p['id']: p for p in d['problems']}
p3, p6 = probs['bank.exam.m2-2020.3'], probs['bank.exam.m2-2020.6']
p3['answerText'] = (p3.get('answerText') or '') + '\n\n' + p6['questionText']
add_note(p3, '审计修复：原卷 m2-2020.6 为本题的结论列表（无题面占位），已并入本题解答')
for gid in ('bank.exam.m2-2020.4', 'bank.exam.m2-2020.5', 'bank.exam.m2-2020.6',
            'bank.exam.m2-2020.7', 'bank.exam.m2-2020.8'):
    d['problems'] = [p for p in d['problems'] if p['id'] != gid]
save(f, d); print('STEP3 m2-2020: 9 →', len(d['problems']), '题')

# ---------- STEP 4: 空主章节回填 ----------
TAX = {
 'cal': load('data/calculus-taxonomy-v1.2.json'),
 'la': load('data/linear-algebra-taxonomy-v1.json'),
 'prob': load('data/probability-taxonomy-v1.json'),
}
id2ch = {}
for s, t in TAX.items():
    for grp in ('knowledge_points', 'problem_types'):
        for it in t[grp]:
            if it.get('chapter_id'):
                id2ch[it['id']] = (s, it['chapter_id'])

def subj_of_id(i):
    if i.startswith('la.'): return 'la'
    if i.startswith('prob.'): return 'prob'
    return 'cal' if i else ''

KW_PROB = ['随机变量','概率','分布列','泊松','正态分布','二项分布','期望','方差','协方差','相关系数','大数定律','中心极限','切比雪夫','极大似然','置信区间','假设检验','样本均值','样本方差','无偏','全概率','贝叶斯','条件概率','古典概型','几何概型','事件']
KW_LA = ['矩阵','行列式','线性方程组','向量组','特征值','特征向量','相似','对角化','秩','线性相关','线性无关','基础解系','二次型','正交变换','伴随矩阵','逆矩阵','初等变换','线性表出','极大无关组','过渡矩阵','施密特']
KW_CAL = [
 ('function_limit_continuity', ['极限','无穷小','间断','连续性','洛必达','左右极限']),
 ('one_variable_differential', ['导数','可导','微分','单调性','极值','凹凸','拐点','渐近线','切线','曲率']),
 ('one_variable_integral', ['积分','原函数','换元','分部','弧长','旋转体']),
 ('differential_equation', ['微分方程','通解','特解','特征方程']),
 ('infinite_series', ['级数','收敛','发散','幂级数','泰勒公式','泰勒展开','麦克劳林','傅里叶']),
 ('multivariable_differential', ['偏导','全微分','多元函数','方向导数','梯度','切平面','法线','条件极值','拉格朗日乘数']),
 ('multiple_integral', ['二重积分','三重积分','累次积分','重积分']),
 ('curve_surface_integral', ['曲线积分','曲面积分','格林公式','高斯公式','斯托克斯','环流量','通量']),
]

def infer(q, tags):
    votes = collections.Counter()
    for t in tags:
        if t in id2ch: votes[id2ch[t]] += 1
    if votes:
        (s, ch), _ = votes.most_common(1)[0]
        return s, ch, 'tags'
    text = q or ''
    if any(k in text for k in KW_PROB): return infer_prob(text)
    if any(k in text for k in KW_LA): return infer_la(text)
    return infer_cal(text)

def infer_la(text):
    kw = {'la.chapter.linear_systems': ['线性方程组','基础解系','通解'],
          'la.chapter.matrices': ['矩阵','逆矩阵','伴随','初等','秩'],
          'la.chapter.vectors': ['向量组','线性相关','线性无关','极大无关','过渡矩阵','基','维数'],
          'la.chapter.determinants': ['行列式'],
          'la.chapter.eigenvalues': ['特征值','特征向量','相似','对角化','二次型','正交'],
          'la.chapter.quadratic_forms': ['二次型','正定','规范形','标准形']}
    for ch, kws in kw.items():
        if any(k in text for k in kws): return 'la', ch, 'kw'
    return 'la', 'la.chapter.matrices', 'kw-fallback'

def infer_prob(text):
    kw = {'prob.chapter.random_events': ['事件','古典概型','几何概型','条件概率','独立','全概率','贝叶斯'],
          'prob.chapter.random_variables': ['分布函数','密度','泊松','二项','正态','均匀分布','指数分布'],
          'prob.chapter.multidimensional_random_variables': ['联合','边缘','条件分布','二维'],
          'prob.chapter.numerical_characteristics': ['期望','方差','协方差','相关系数','矩'],
          'prob.chapter.limit_theorems': ['大数定律','中心极限','切比雪夫','依概率'],
          'prob.chapter.parameter_estimation': ['估计','矩估计','极大似然','置信'],
          'prob.chapter.hypothesis_testing': ['假设检验','显著性']}
    for ch, kws in kw.items():
        if any(k in text for k in kws): return 'prob', ch, 'kw'
    return 'prob', 'prob.chapter.random_variables', 'kw-fallback'

def infer_cal(text):
    for ch, kws in KW_CAL:
        if any(k in text for k in kws): return 'cal', ch, 'kw'
    return 'cal', 'function_limit_continuity', 'kw-fallback'

stats = collections.Counter()
for f in sorted(glob.glob(f'{EX}/math*/*.json')):
    d = load(f); changed = False
    for p in d['problems']:
        if p.get('primaryChapterId'): continue
        tags = [v for fld in ('primaryProblemTypeId','secondaryProblemTypeIds','knowledgePointIds','methodIds')
                for v in (p.get(fld) if isinstance(p.get(fld), list) else [p.get(fld)]) if v]
        s, ch, how = infer(p.get('questionText',''), tags)
        p['primaryChapterId'] = ch
        howtxt = '打标多数票' if how == 'tags' else ('关键词' if how == 'kw' else '关键词兜底')
        add_note(p, f'审计回填：主章节原为空，按{howtxt}推断为 {ch}')
        stats[(s, how)] += 1; changed = True
    if changed: save(f, d)
print('STEP4 回填:', sum(stats.values()), dict(stats))

# ---------- STEP 5: 7 道跨科目/非法打标 ----------
def rep_kp(f, pid, old, new, why):
    d = load(f)
    p = next(x for x in d['problems'] if x['id'] == pid)
    assert old in p['knowledgePointIds'], (pid, p['knowledgePointIds'])
    p['knowledgePointIds'] = [new if k == old else k for k in p['knowledgePointIds']]
    add_note(p, f'审计修复：跨科目/非法知识点 {old} → {new}（{why}）')
    save(f, d)

rep_kp(f'{EX}/math1/1996.json', 'bank.exam.m1-1996.22', 'quadric_surface_equations', 'la.knowledge.standard_form', '第(2)问即化标准形判断二次曲面类型')
rep_kp(f'{EX}/math1/2002.json', 'bank.exam.m1-2002.21', 'infinitesimal_order', 'la.knowledge.eigen_concept', '纯线代相似证明题，特征多项式对应特征值概念')
rep_kp(f'{EX}/math1/2003.json', 'bank.exam.m1-2003.6', 'definite_integral_properties', 'prob.knowledge.normal_distribution', '纯概率置信区间题，误带高数积分知识点')
rep_kp(f'{EX}/math1/2026.json', 'bank.exam.m1-2026.7', 'cylindrical_surface', 'la.knowledge.standard_form', '二次型标准形判曲面（柱面）')

d = load(f'{EX}/math2/1999.json')
p = next(x for x in d['problems'] if x['id'] == 'bank.exam.m2-1999.10')
p['primaryProblemTypeId'] = 'la.problem_type.determinant_computation'
add_note(p, '审计修复：非法题型 equation_root → la.problem_type.determinant_computation（行列式展开求根）')
save(f'{EX}/math2/1999.json', d)

d = load(f'{EX}/math2/2001.json')
p = next(x for x in d['problems'] if x['id'] == 'bank.exam.m2-2001.10')
p['primaryChapterId'] = 'one_variable_differential'
p['primaryProblemTypeId'] = 'monotonicity_extrema'
p['knowledgePointIds'] = ['monotonicity']
add_note(p, '审计修复：题面为「由 f 的图形选 f′ 的图形」，属一元导数应用；原章节/打标（线代线性相关性）系入库错置，改挂 one_variable_differential / monotonicity_extrema')
save(f'{EX}/math2/2001.json', d)

d = load(f'{EX}/math2/2023.json')
p = next(x for x in d['problems'] if x['id'] == 'bank.exam.m2-2023.37')
p['primaryChapterId'] = 'one_variable_differential'
p['primaryProblemTypeId'] = 'limit_proof'
p['knowledgePointIds'] = ['taylor_formula', 'mean_value_theorem']
add_note(p, '审计修复：题面为泰勒公式中值证明（2023 数二解答题），原章节/打标（概率随机变量函数分布）系入库错置，改挂 one_variable_differential / limit_proof / taylor_formula+mean_value_theorem')
save(f'{EX}/math2/2023.json', d)
print('STEP5 ok')

# ---------- STEP 6: m3-2022.20 OCR 断杆 ----------
f = f'{EX}/math3/2022.json'
d = load(f)
for p in d['problems']:
    for fld in ('questionText', 'answerText'):
        v = p.get(fld)
        if v and '{\\infty}rac{' in v:
            p[fld] = v.replace('{\\infty}rac{', '{\\infty}\\frac{')
            print('STEP6 OCR frac 修复:', p['id'], fld)
save(f, d)

# ---------- STEP 7: index total/withAnswer 重算（校验器口径：answerText 非空） ----------
ix = load(f'{EX}/index.json')
def walk(o):
    if isinstance(o, dict):
        if o.get('paper') and o.get('year'):
            key = f"{EX}/{o['paper']}/{o['year']}.json"
            if os.path.exists(key):
                d = load(key)
                wa = sum(1 for p in d['problems'] if (p.get('answerText') or '').strip())
                tot = len(d['problems'])
                if o.get('withAnswer') != wa or o.get('total') != tot:
                    print(f"STEP7 index 修正: {o['paper']} {o['year']} withAnswer {o.get('withAnswer')}→{wa} total {o.get('total')}→{tot}")
                    o['withAnswer'] = wa; o['total'] = tot
        for v in o.values(): walk(v)
    elif isinstance(o, list):
        for it in o: walk(it)
walk(ix)
save(f'{EX}/index.json', ix)
print('STEP7 index ok')
print('ALL STEPS DONE')
