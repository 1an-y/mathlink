export interface DefinitionEntry {
  id: string;
  title: string;
  content: string;
  chapterId: string;
  updatedAt: string;
}

const seededAt = "2026-09-21T00:00:00.000Z";

export const seedDefinitions: DefinitionEntry[] = [
  {
    id: "seed-limit-epsilon-delta",
    title: "函数极限的定义",
    chapterId: "function_limit_continuity",
    updatedAt: seededAt,
    content: "设函数 $f(x)$ 在点 $x_0$ 的某个去心邻域内有定义。若对任意 $\\varepsilon>0$，都存在 $\\delta>0$，使得当 $0<|x-x_0|<\\delta$ 时，有 $|f(x)-A|<\\varepsilon$，则称 $A$ 是 $f(x)$ 当 $x\\to x_0$ 时的极限，记作：\n\n$$\\lim_{x\\to x_0}f(x)=A$$"
  },
  {
    id: "seed-sequence-limit",
    title: "数列极限的定义",
    chapterId: "function_limit_continuity",
    updatedAt: seededAt,
    content: "若对任意 $\\varepsilon>0$，都存在正整数 $N$，使得当 $n>N$ 时恒有 $|x_n-a|<\\varepsilon$，则称数列 $\\{x_n\\}$ 收敛于 $a$，记作 $\\lim_{n\\to\\infty}x_n=a$。"
  },
  {
    id: "seed-continuity",
    title: "函数在一点连续",
    chapterId: "function_limit_continuity",
    updatedAt: seededAt,
    content: "设函数 $f(x)$ 在点 $x_0$ 的某个邻域内有定义。若\n\n$$\\lim_{x\\to x_0}f(x)=f(x_0)$$\n\n则称 $f(x)$ 在点 $x_0$ 连续。它等价于左连续与右连续同时成立。"
  },
  {
    id: "seed-equivalent-infinitesimal",
    title: "等价无穷小",
    chapterId: "function_limit_continuity",
    updatedAt: seededAt,
    content: "若 $\\alpha$ 与 $\\beta$ 是同一变化过程中的无穷小，且\n\n$$\\lim\\frac{\\alpha}{\\beta}=1$$\n\n则称 $\\alpha$ 与 $\\beta$ 是等价无穷小，记作 $\\alpha\\sim\\beta$。"
  },
  {
    id: "seed-derivative",
    title: "导数的定义",
    chapterId: "one_variable_differential",
    updatedAt: seededAt,
    content: "若极限\n\n$$\\lim_{\\Delta x\\to0}\\frac{f(x_0+\\Delta x)-f(x_0)}{\\Delta x}$$\n\n存在，则称函数 $f(x)$ 在 $x_0$ 处可导，该极限称为 $f(x)$ 在 $x_0$ 处的导数，记作 $f'(x_0)$。"
  },
  {
    id: "seed-differentiable",
    title: "一元函数可微",
    chapterId: "one_variable_differential",
    updatedAt: seededAt,
    content: "若函数增量可以写成\n\n$$\\Delta y=A\\Delta x+o(\\Delta x)$$\n\n其中 $A$ 与 $\\Delta x$ 无关，则称 $f(x)$ 在该点可微。对一元函数，可微与可导等价，且 $A=f'(x)$。"
  },
  {
    id: "seed-taylor-formula",
    title: "Taylor 公式",
    chapterId: "one_variable_differential",
    updatedAt: seededAt,
    content: "若函数 $f$ 在 $x_0$ 附近具有足够阶导数，则\n\n$$f(x)=\\sum_{k=0}^{n}\\frac{f^{(k)}(x_0)}{k!}(x-x_0)^k+R_n(x)$$\n\n其中 $R_n(x)$ 是余项。带 Peano 余项时，$R_n(x)=o((x-x_0)^n)$。"
  },
  {
    id: "seed-definite-integral",
    title: "定积分的定义",
    chapterId: "one_variable_integral",
    updatedAt: seededAt,
    content: "将区间 $[a,b]$ 任意分割并在每个小区间内取点 $\\xi_i$。若当最大区间长度趋于零时，和式的极限存在且与分割及取点方式无关，则定义\n\n$$\\int_a^b f(x)\\,dx=\\lim_{\\lambda\\to0}\\sum_{i=1}^{n}f(\\xi_i)\\Delta x_i$$"
  },
  {
    id: "seed-fundamental-theorem",
    title: "微积分基本定理",
    chapterId: "one_variable_integral",
    updatedAt: seededAt,
    content: "若 $f$ 在 $[a,b]$ 上连续，则变上限积分 $F(x)=\\int_a^x f(t)\\,dt$ 在 $[a,b]$ 上可导，且\n\n$$F'(x)=f(x)$$\n\n若 $G'(x)=f(x)$，则 $\\int_a^b f(x)\\,dx=G(b)-G(a)$。"
  },
  {
    id: "seed-partial-derivative",
    title: "偏导数",
    chapterId: "multivariable_differential",
    updatedAt: seededAt,
    content: "固定其他自变量，只让一个自变量变化所得的变化率称为偏导数。例如\n\n$$\\frac{\\partial f}{\\partial x}(x_0,y_0)=\\lim_{h\\to0}\\frac{f(x_0+h,y_0)-f(x_0,y_0)}{h}$$"
  },
  {
    id: "seed-total-differential",
    title: "二元函数可微与全微分",
    chapterId: "multivariable_differential",
    updatedAt: seededAt,
    content: "若函数增量满足\n\n$$\\Delta z=A\\Delta x+B\\Delta y+o(\\rho),\\qquad \\rho=\\sqrt{(\\Delta x)^2+(\\Delta y)^2}$$\n\n则称函数在该点可微，其全微分为 $dz=A\\,dx+B\\,dy$。可微时 $A=f_x$，$B=f_y$。"
  },
  {
    id: "seed-series-convergence",
    title: "数项级数收敛",
    chapterId: "infinite_series",
    updatedAt: seededAt,
    content: "对级数 $\\sum_{n=1}^{\\infty}u_n$，令部分和 $S_n=\\sum_{k=1}^{n}u_k$。若数列 $\\{S_n\\}$ 存在有限极限 $S$，则称该级数收敛，并称 $S$ 为级数的和。"
  }
];

seedDefinitions.push(
  { id:"seed-one-sided-limit", title:"单侧极限", chapterId:"function_limit_continuity", updatedAt:seededAt, content:"当 $x$ 只从 $x_0$ 左侧趋近时的极限称为左极限，记作 $\\lim_{x\\to x_0^-}f(x)$；从右侧趋近时称为右极限。双侧极限存在的充要条件是左右极限都存在且相等。" },
  { id:"seed-infinite-limit", title:"无穷大与无穷小", chapterId:"function_limit_continuity", updatedAt:seededAt, content:"若在某变化过程中 $\\lim \\alpha=0$，则称 $\\alpha$ 为无穷小；若对任意 $M>0$，最终恒有 $|f(x)|>M$，则称 $f(x)$ 为无穷大。无穷大不是一个有限数。" },
  { id:"seed-infinitesimal-order", title:"无穷小的阶", chapterId:"function_limit_continuity", updatedAt:seededAt, content:"设 $\\alpha,\\beta$ 均为无穷小。若 $\\lim\\alpha/\\beta=0$，则 $\\alpha$ 是比 $\\beta$ 高阶的无穷小；若极限为非零常数，则二者同阶；若极限为 $1$，则二者等价。" },
  { id:"seed-important-limits", title:"两个重要极限", chapterId:"function_limit_continuity", updatedAt:seededAt, content:"考研中常用的两个基本极限为\n\n$$\\lim_{x\\to0}\\frac{\\sin x}{x}=1,\\qquad \\lim_{x\\to0}(1+x)^{1/x}=e$$\n\n第二个也常写成 $\\lim_{x\\to\\infty}(1+1/x)^x=e$。" },
  { id:"seed-discontinuity", title:"间断点及其分类", chapterId:"function_limit_continuity", updatedAt:seededAt, content:"若函数在 $x_0$ 不连续，则称 $x_0$ 为间断点。左右极限都存在时属于第一类间断点，其中相等为可去间断点、不等为跳跃间断点；其余属于第二类间断点。" },
  { id:"seed-closed-interval", title:"闭区间连续函数的性质", chapterId:"function_limit_continuity", updatedAt:seededAt, content:"函数在闭区间 $[a,b]$ 上连续，则必有界并能取得最大值和最小值；还能取得最小值与最大值之间的每一个值。若 $f(a)f(b)<0$，则 $(a,b)$ 内至少存在一个零点。" },
  { id:"seed-derivative-continuity", title:"可导与连续的关系", chapterId:"one_variable_differential", updatedAt:seededAt, content:"函数在一点可导，则在该点必连续；连续不一定可导。例如 $f(x)=|x|$ 在 $0$ 处连续但不可导。" },
  { id:"seed-fermat", title:"Fermat 定理", chapterId:"one_variable_differential", updatedAt:seededAt, content:"若函数 $f$ 在内点 $x_0$ 取得局部极值，并且 $f'(x_0)$ 存在，则\n\n$$f'(x_0)=0$$\n\n导数为零只是可导极值点的必要条件，不是充分条件。" },
  { id:"seed-rolle", title:"Rolle 中值定理", chapterId:"one_variable_differential", updatedAt:seededAt, content:"若 $f$ 在 $[a,b]$ 上连续、在 $(a,b)$ 内可导，且 $f(a)=f(b)$，则至少存在 $\\xi\\in(a,b)$，使 $f'(\\xi)=0$。" },
  { id:"seed-lagrange-mvt", title:"Lagrange 中值定理", chapterId:"one_variable_differential", updatedAt:seededAt, content:"若 $f$ 在 $[a,b]$ 上连续、在 $(a,b)$ 内可导，则至少存在 $\\xi\\in(a,b)$，使\n\n$$f'(\\xi)=\\frac{f(b)-f(a)}{b-a}$$" },
  { id:"seed-cauchy-mvt", title:"Cauchy 中值定理", chapterId:"one_variable_differential", updatedAt:seededAt, content:"若 $f,g$ 在 $[a,b]$ 上连续、在 $(a,b)$ 内可导，且 $g'(x)\\ne0$，则至少存在 $\\xi\\in(a,b)$，使\n\n$$\\frac{f(b)-f(a)}{g(b)-g(a)}=\\frac{f'(\\xi)}{g'(\\xi)}$$" },
  { id:"seed-extremum", title:"极值与驻点", chapterId:"one_variable_differential", updatedAt:seededAt, content:"若 $x_0$ 的某邻域内恒有 $f(x)\\le f(x_0)$ 或恒有 $f(x)\\ge f(x_0)$，则 $x_0$ 为极值点。满足 $f'(x_0)=0$ 的点称为驻点；驻点不一定是极值点。" },
  { id:"seed-inflection", title:"凹凸性与拐点", chapterId:"one_variable_differential", updatedAt:seededAt, content:"若 $f'$ 在区间上单调增加，则曲线为凹；若 $f'$ 单调减少，则曲线为凸。曲线凹凸性发生改变的点称为拐点；$f''(x_0)=0$ 不是拐点的充分条件。" },
  { id:"seed-asymptote", title:"渐近线", chapterId:"one_variable_differential", updatedAt:seededAt, content:"若 $\\lim_{x\\to x_0}f(x)=\\infty$，则 $x=x_0$ 为铅直渐近线；若 $\\lim_{x\\to\\infty}f(x)=b$，则 $y=b$ 为水平渐近线。若 $\\lim[f(x)-(ax+b)]=0$，则 $y=ax+b$ 为斜渐近线。" },
  { id:"seed-antiderivative", title:"原函数与不定积分", chapterId:"one_variable_integral", updatedAt:seededAt, content:"若在区间上 $F'(x)=f(x)$，则称 $F$ 为 $f$ 的一个原函数。$f$ 的全体原函数称为不定积分：\n\n$$\\int f(x)\\,dx=F(x)+C$$" },
  { id:"seed-integral-mean-value", title:"积分中值定理", chapterId:"one_variable_integral", updatedAt:seededAt, content:"若 $f$ 在 $[a,b]$ 上连续，则至少存在 $\\xi\\in[a,b]$，使\n\n$$\\int_a^b f(x)\\,dx=f(\\xi)(b-a)$$" },
  { id:"seed-improper-integral", title:"无穷区间反常积分", chapterId:"one_variable_integral", updatedAt:seededAt, content:"定义\n\n$$\\int_a^{\\infty}f(x)\\,dx=\\lim_{t\\to\\infty}\\int_a^t f(x)\\,dx$$\n\n右侧极限有限时称反常积分收敛，否则称发散。" },
  { id:"seed-unbounded-integral", title:"无界函数反常积分", chapterId:"one_variable_integral", updatedAt:seededAt, content:"若 $f$ 在 $b$ 的左侧无界，则定义\n\n$$\\int_a^b f(x)\\,dx=\\lim_{t\\to b^-}\\int_a^t f(x)\\,dx$$\n\n极限有限时称积分收敛。" },
  { id:"seed-double-limit", title:"二重极限", chapterId:"multivariable_differential", updatedAt:seededAt, content:"若对任意 $\\varepsilon>0$，存在 $\\delta>0$，使 $0<\\sqrt{(x-x_0)^2+(y-y_0)^2}<\\delta$ 时恒有 $|f(x,y)-A|<\\varepsilon$，则称 $A$ 为二重极限。" },
  { id:"seed-directional-derivative", title:"方向导数", chapterId:"multivariable_differential", updatedAt:seededAt, content:"函数沿单位向量 $\\boldsymbol l=(\\cos\\alpha,\\cos\\beta)$ 的方向导数定义为\n\n$$\\frac{\\partial f}{\\partial l}=\\lim_{t\\to0}\\frac{f(x_0+t\\cos\\alpha,y_0+t\\cos\\beta)-f(x_0,y_0)}{t}$$" },
  { id:"seed-gradient", title:"梯度", chapterId:"multivariable_differential", updatedAt:seededAt, content:"可微函数 $f(x,y)$ 的梯度为\n\n$$\\operatorname{grad}f=(f_x,f_y)$$\n\n梯度方向是函数增长最快的方向，其模等于最大方向导数。" },
  { id:"seed-multivariable-extremum", title:"多元函数极值", chapterId:"multivariable_differential", updatedAt:seededAt, content:"若点 $(x_0,y_0)$ 的某邻域内恒有 $f(x,y)\\le f(x_0,y_0)$ 或恒有反向不等式，则该点为极值点。可微函数在内点取极值时，通常满足 $f_x=f_y=0$。" },
  { id:"seed-conditional-extremum", title:"条件极值", chapterId:"multivariable_differential", updatedAt:seededAt, content:"在约束 $\\varphi(x,y)=0$ 下求 $f(x,y)$ 的极值称为条件极值。Lagrange 乘数法构造 $L=f+\\lambda\\varphi$，并令 $L_x=L_y=L_\\lambda=0$。" },
  { id:"seed-double-integral", title:"二重积分", chapterId:"multiple_integral", updatedAt:seededAt, content:"将有界区域 $D$ 分割为小区域 $\\Delta\\sigma_i$，若和式极限存在且与分割和取点无关，则\n\n$$\\iint_D f(x,y)\\,d\\sigma=\\lim_{\\lambda\\to0}\\sum f(\\xi_i,\\eta_i)\\Delta\\sigma_i$$" },
  { id:"seed-triple-integral", title:"三重积分", chapterId:"multiple_integral", updatedAt:seededAt, content:"三重积分是函数在空间区域 $\\Omega$ 上积分和的极限，记作 $\\iiint_\\Omega f(x,y,z)\\,dv$。直角坐标下体积元为 $dv=dx\\,dy\\,dz$。" },
  { id:"seed-polar-jacobian", title:"极坐标面积元", chapterId:"multiple_integral", updatedAt:seededAt, content:"极坐标变换为 $x=r\\cos\\theta,y=r\\sin\\theta$，Jacobian 为 $r$，因此\n\n$$dx\\,dy=r\\,dr\\,d\\theta$$" },
  { id:"seed-spherical-jacobian", title:"球坐标体积元", chapterId:"multiple_integral", updatedAt:seededAt, content:"球坐标下 $x=r\\sin\\varphi\\cos\\theta,y=r\\sin\\varphi\\sin\\theta,z=r\\cos\\varphi$，体积元为\n\n$$dv=r^2\\sin\\varphi\\,dr\\,d\\varphi\\,d\\theta$$" },
  { id:"seed-line-integral-first", title:"第一类曲线积分", chapterId:"curve_surface_integral", updatedAt:seededAt, content:"第一类曲线积分是对弧长的积分，记作 $\\int_L f(x,y,z)\\,ds$，与曲线方向无关。参数化后 $ds=\\sqrt{x'^2+y'^2+z'^2}\\,dt$。" },
  { id:"seed-line-integral-second", title:"第二类曲线积分", chapterId:"curve_surface_integral", updatedAt:seededAt, content:"第二类曲线积分是对坐标的积分，记作 $\\int_L P\\,dx+Q\\,dy+R\\,dz$，与曲线方向有关，改变方向时积分变号。" },
  { id:"seed-path-independence", title:"路径无关与势函数", chapterId:"curve_surface_integral", updatedAt:seededAt, content:"在单连通区域内，曲线积分 $\\int_L P\\,dx+Q\\,dy$ 与路径无关，等价于存在势函数 $u$ 使 $du=P\\,dx+Q\\,dy$；在偏导连续时也等价于 $P_y=Q_x$。" },
  { id:"seed-green", title:"Green 公式", chapterId:"curve_surface_integral", updatedAt:seededAt, content:"若 $D$ 由分段光滑正向闭曲线 $L$ 围成，则\n\n$$\\oint_L P\\,dx+Q\\,dy=\\iint_D(Q_x-P_y)\\,dx\\,dy$$" },
  { id:"seed-surface-integral-first", title:"第一类曲面积分", chapterId:"curve_surface_integral", updatedAt:seededAt, content:"第一类曲面积分是对面积的积分，记作 $\\iint_\\Sigma f(x,y,z)\\,dS$，与曲面侧的选择无关。" },
  { id:"seed-surface-integral-second", title:"第二类曲面积分", chapterId:"curve_surface_integral", updatedAt:seededAt, content:"第二类曲面积分是对有向曲面的通量积分，记作 $\\iint_\\Sigma P\\,dy\\,dz+Q\\,dz\\,dx+R\\,dx\\,dy$，改变曲面侧时积分变号。" },
  { id:"seed-gauss", title:"Gauss 公式", chapterId:"curve_surface_integral", updatedAt:seededAt, content:"若闭曲面 $\\Sigma$ 取外侧并围成区域 $\\Omega$，则\n\n$$\\oiint_\\Sigma P\\,dy\\,dz+Q\\,dz\\,dx+R\\,dx\\,dy=\\iiint_\\Omega(P_x+Q_y+R_z)\\,dv$$" },
  { id:"seed-stokes", title:"Stokes 公式", chapterId:"curve_surface_integral", updatedAt:seededAt, content:"曲面 $\\Sigma$ 的侧与边界曲线 $L$ 的方向符合右手规则时，$L$ 上的曲线积分等于旋度在 $\\Sigma$ 上的通量积分。" },
  { id:"seed-positive-series", title:"正项级数", chapterId:"infinite_series", updatedAt:seededAt, content:"各项均非负的级数称为正项级数。其部分和单调增加，因此正项级数收敛的充要条件是部分和数列有上界。" },
  { id:"seed-absolute-convergence", title:"绝对收敛与条件收敛", chapterId:"infinite_series", updatedAt:seededAt, content:"若 $\\sum|u_n|$ 收敛，则 $\\sum u_n$ 绝对收敛；若 $\\sum u_n$ 收敛但 $\\sum|u_n|$ 发散，则称条件收敛。绝对收敛必推出原级数收敛。" },
  { id:"seed-alternating-series", title:"Leibniz 判别法", chapterId:"infinite_series", updatedAt:seededAt, content:"对交错级数 $\\sum(-1)^{n-1}u_n$，若 $u_n$ 单调不增且 $u_n\\to0$，则级数收敛，余项满足 $|R_n|\\le u_{n+1}$。" },
  { id:"seed-power-series", title:"幂级数与收敛半径", chapterId:"infinite_series", updatedAt:seededAt, content:"幂级数 $\\sum a_n(x-x_0)^n$ 存在收敛半径 $R$：当 $|x-x_0|<R$ 时绝对收敛，当 $|x-x_0|>R$ 时发散；端点需另行判断。" },
  { id:"seed-taylor-series", title:"Taylor 级数", chapterId:"infinite_series", updatedAt:seededAt, content:"函数在 $x_0$ 处的 Taylor 级数为\n\n$$\\sum_{n=0}^{\\infty}\\frac{f^{(n)}(x_0)}{n!}(x-x_0)^n$$\n\n函数等于其 Taylor 级数还要求余项在相应区间趋于零。" },
  { id:"seed-separable-ode", title:"可分离变量微分方程", chapterId:"differential_equation", updatedAt:seededAt, content:"能写成 $g(y)\\,dy=f(x)\\,dx$ 的一阶方程称为可分离变量方程。两边积分得到通解，并需检查分离过程中可能遗漏的常数解。" },
  { id:"seed-homogeneous-ode", title:"一阶齐次微分方程", chapterId:"differential_equation", updatedAt:seededAt, content:"形如 $dy/dx=F(y/x)$ 的方程称为一阶齐次方程。令 $u=y/x$，即 $y=ux$，可化为可分离变量方程。" },
  { id:"seed-linear-first-ode", title:"一阶线性微分方程", chapterId:"differential_equation", updatedAt:seededAt, content:"标准形式为 $y'+P(x)y=Q(x)$，通解为\n\n$$y=e^{-\\int Pdx}\\left(\\int Qe^{\\int Pdx}dx+C\\right)$$" },
  { id:"seed-bernoulli-ode", title:"Bernoulli 方程", chapterId:"differential_equation", updatedAt:seededAt, content:"形如 $y'+P(x)y=Q(x)y^n$（$n\\ne0,1$）的方程称为 Bernoulli 方程。令 $z=y^{1-n}$ 可化为一阶线性方程。" },
  { id:"seed-linear-second-ode", title:"二阶常系数齐次线性方程", chapterId:"differential_equation", updatedAt:seededAt, content:"方程 $y''+py'+qy=0$ 的特征方程为 $r^2+pr+q=0$。通解形式由两个实根、重根或一对共轭复根三种情况决定。" },
  { id:"seed-linear-nonhomogeneous-ode", title:"二阶常系数非齐次线性方程", chapterId:"differential_equation", updatedAt:seededAt, content:"方程 $y''+py'+qy=f(x)$ 的通解等于对应齐次方程的通解与一个非齐次特解之和：$y=y_h+y_p$。" }
);
