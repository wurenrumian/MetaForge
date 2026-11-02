# MetaForge 内容制作规范（给写作 Agent）

这份文档定义本站三套教程的统一写法。**动手前请先读一遍**，并阅读 `docs/type-theory/01-what-is-a-type.md` 作为风格样例。

## 1. 总体语气

- 用**简体中文**写作，技术术语首次出现时给出英文，例如“依赖类型（dependent type）”。
- 目标读者是**有编程经验、但没有专门学过该主题**的工程师。不要假设读者懂范畴论、形式语义或模板元编程黑话。
- 语气像一个耐心的同事在白板前讲解：先给直觉，再给定义，再给例子，最后指出边界。
- **不要写空话**。每一段都要推进理解：解释一个机制、拆一个反例、回答一个“为什么”。
- 避免“众所周知”“显然”“简单来说”这类词。如果一件事显然，就不需要写；如果需要写，就解释它为什么不显然。

## 2. 每章的结构

每章是一个独立的 Markdown 文件，建议 2500–5000 个中文字符（不含代码），结构如下：

```md
---
title: 01 · 类型到底是什么
description: 一句话说明本章解决的问题（用于 SEO 与侧边栏摘要）
---

# 01 · 类型到底是什么

> **一句话**：本章的核心结论，用一句人话写出来。

## 为什么需要这个概念
（从一个具体困惑/ bug/ 反例切入，不要从定义开始）

## 核心内容（2–5 个二级标题）
（每个小节：直觉 → 精确定义 → 例子 → 边界情况）

## 人话总结
<div class="human-note">
<strong>如果只记住一件事：</strong>……
</div>

## 常见误解
（3–4 条，每条“误解 → 为什么错 → 正确说法”）

## 本章小结
（3–5 条 bullet，只写结论，不重复论证）

## 练习
（2–4 题，难度递进；至少一题要求读者改代码或找反例）

---

下一篇：[02 · Agda 入门](/type-theory/02-agda-basics)
```

不是每章都必须完全一样，但**必须有**：开头的“一句话”、正文中至少一个“人话”类比、结尾的“常见误解/小结/练习”。

## 3. Markdown 与 VitePress 约定

- 使用 VitePress 容器增强可读性：
  - `::: tip` 用于补充技巧
  - `::: warning` 用于危险/易错点
  - `::: details` 用于可折叠的补充推导
  - `::: info` 用于背景知识
- 可用 `<div class="human-note">…</div>` 做“人话解释”块。
- 可用 `<div class="chapter-grid">` + `<a class="chapter-card">` 做章末导航（可选）。
- 图表使用 `mermaid` 代码块，**每章最多 1–2 个**，且图必须真的帮助理解，不要为了好看而画。站点在构建期用 **Pele** 把这些代码块渲染成静态 SVG（语法仍是 Mermaid，兼容 Mermaid 12.x 的常见子集），不是 mermaid.js，也不需要客户端 JS。
- 数学公式使用 `$...$` 或 `$$...$$`（已启用 MathJax）。
- 不要引用外部图片；不要写需要联网才能看的资源。
- 链接使用站内绝对路径（不带 `.md` 后缀），例如 `/lifetime/05-containers-iterators`。

## 4. 代码规范

### Agda

- 使用 ```` ```agda ```` 代码块。
- 示例尽量**自包含**：不要依赖读者没见过的标准库模块。需要标准库时，明确写出 `open import` 并说明版本。
- 每篇开头给出完整的模块声明，例如：
  ```agda
  module Chapter02 where
  ```
- 代码块之间用中文解释“这一步在证什么”，不要只贴代码。
- 不要声称“这段代码一定能在你的环境通过检查”。可以写“在 Agda 2.6.x + stdlib 2.0 下应当通过；如报错，先检查版本”。
- 避免使用过于前沿的语法（cubical、`--cubical`、`--two-level` 等）。

### C++

- 默认 **C++20**；使用 C++23 特性时明确标注。
- 示例要能说明问题，优先短小；必要时给出完整 `#include` 与 `main`。
- 涉及未定义行为时，明确写“这是 UB，不要依赖实际输出”，并解释为什么。
- 不要用编译器特定的扩展（除非明确说明）。
- 模板报错示例可以截取关键几行，并解释“第一行真正有用的信息在哪”。

### 多语言对照（仅生命周期路线）

- C++ 为主，Rust/Python/Go/Java 为辅。
- 对照要短，重点说明“同一问题在不同语言里被谁负责解决”，不要变成语言教程。

## 5. 质量红线

- **不要编造 API、标准库函数或语言行为。** 不确定就换一个你确定的例子。
- **不要用“类型系统保证了正确性”这种绝对说法。** 类型保证的是“相对于规格的正确性”；规格本身可能写错。
- **不要把相关当因果。** 例如“用了 RAII 就不会泄漏”——RAII 管的是释放责任，不管逻辑上是否该释放。
- **每个反例都要说明后果**：编译错误、UB、逻辑错误、性能问题，还是资源泄漏。
- **不要重复前面章节的完整定义**，用一句“回顾”加链接即可。

## 6. 文件与协作

- 只修改分配给你的文件；**不要**改 `docs/.vitepress/config.mts`、主题、首页或其他路线的文件。
- **不要**运行 `npm install`、`npm run build`、`npm run dev`（会有多个 Agent 并发，容易互相干扰）。协调者会统一构建。
- 写完后用 `git status --short` 确认只改了自己的文件。
- 完成后通过 `worker_done` 汇报：文件列表、每篇字数、你最有把握/最没把握的部分。

## 7. 站内链接清单

类型论：

- `/type-theory/01-what-is-a-type`
- `/type-theory/02-agda-basics`
- `/type-theory/03-inductive-types`
- `/type-theory/04-dependent-types`
- `/type-theory/05-propositions-as-types`
- `/type-theory/06-equality-and-proofs`
- `/type-theory/07-universes`
- `/type-theory/08-back-to-mainstream`

生命周期：

- `/lifetime/01-three-meanings`
- `/lifetime/02-stack-heap-scope`
- `/lifetime/03-ownership-raii`
- `/lifetime/04-references-dangling`
- `/lifetime/05-containers-iterators`
- `/lifetime/06-recursion-backtracking`
- `/lifetime/07-graph-algorithms`
- `/lifetime/08-concurrency-async`
- `/lifetime/09-checklist`

C++ 模板：

- `/cpp-tmp/01-template-basics`
- `/cpp-tmp/02-specialization`
- `/cpp-tmp/03-constexpr`
- `/cpp-tmp/04-type-traits-sfinae`
- `/cpp-tmp/05-variadic-templates`
- `/cpp-tmp/06-concepts`
- `/cpp-tmp/07-patterns`
- `/cpp-tmp/08-cheatsheet`

## 8. 参考风格样例

请阅读 `docs/type-theory/01-what-is-a-type.md`。注意它如何：

- 用一个具体判断 `true : Bool` 开场；
- 把“类型是集合”讲清楚，再指出它在哪里不够用；
- 用“合同/审核员”类比，但不让类比替代定义；
- 在“常见误解”里主动拆掉读者可能形成的错误直觉。
