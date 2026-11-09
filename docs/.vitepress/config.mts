import { defineConfig } from 'vitepress'
import { render } from 'pele'

/**
 * 把 ```mermaid 代码块交给 Pele 在构建期渲染成静态 SVG。
 * Markdown 里仍然写 Mermaid 语法；产物里没有 mermaid.js，也不需要客户端 JS。
 */
function peleDiagrams(md: any) {
  md.core.ruler.push('pele_diagrams', (state: any) => {
    for (const token of state.tokens) {
      if (token.type === 'fence' && token.info.trim().toLowerCase() === 'mermaid') {
        token.type = 'pele_diagram'
      }
    }
  })

  md.renderer.rules.pele_diagram = (tokens: any[], idx: number) => {
    const source = tokens[idx].content
    try {
      const { svg } = render(source)
      return `<div class="pele-diagram">${svg}</div>\n`
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return `<pre class="pele-error">Pele 渲染失败：${md.utils.escapeHtml(
        message
      )}\n\n${md.utils.escapeHtml(source)}</pre>\n`
    }
  }
}

// 部署在统一入口的子路径下时用 BASE_PATH 覆盖；本地开发保持 '/'
const base = process.env.BASE_PATH || '/'

export default defineConfig({
    base,
    lang: 'zh-CN',
    title: 'MetaForge',
    description:
      '用 Agda 学类型论，用直觉理解算法中的生命周期，再认识 C++ 模板元编程。',

    cleanUrls: true,
    lastUpdated: true,
    head: [
      ['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}logo.svg` }],
      ['meta', { name: 'theme-color', content: '#5b5bd6' }],
    ],

    markdown: {
      math: true,
      lineNumbers: true,
      config: peleDiagrams,
      languageAlias: {
        // Shiki 没有内置 Agda 语法；Haskell 的关键字/注释/类型签名着色最接近，
        // 比退化成纯文本更好读，也不影响代码复制。
        agda: 'haskell',
      },
      theme: {
        light: 'github-light',
        dark: 'github-dark',
      },
    },

    themeConfig: {
      logo: '/logo.svg',
      siteTitle: 'MetaForge',

      nav: [
        { text: '首页', link: '/' },
        { text: '类型论 × Agda', link: '/type-theory/' },
        { text: '算法生命周期', link: '/lifetime/' },
        { text: 'C++ 模板元编程', link: '/cpp-tmp/' },
        { text: '阅读指南', link: '/guide/' },
      ],

      sidebar: {
        '/type-theory/': [
          {
            text: '类型论 × Agda',
            items: [
              { text: '这条路线讲什么', link: '/type-theory/' },
              { text: '01 · 类型到底是什么', link: '/type-theory/01-what-is-a-type' },
              { text: '02 · Agda 入门', link: '/type-theory/02-agda-basics' },
              { text: '03 · 归纳数据类型', link: '/type-theory/03-inductive-types' },
              { text: '04 · 依赖类型', link: '/type-theory/04-dependent-types' },
              { text: '05 · 命题即类型', link: '/type-theory/05-propositions-as-types' },
              { text: '06 · 等式与证明', link: '/type-theory/06-equality-and-proofs' },
              { text: '07 · 宇宙与一致性', link: '/type-theory/07-universes' },
              { text: '08 · 回到日常语言', link: '/type-theory/08-back-to-mainstream' },
            ],
          },
        ],
        '/lifetime/': [
          {
            text: '算法中的生命周期',
            items: [
              { text: '这条路线讲什么', link: '/lifetime/' },
              { text: '01 · 生命周期的三层含义', link: '/lifetime/01-three-meanings' },
              { text: '02 · 栈、堆与作用域', link: '/lifetime/02-stack-heap-scope' },
              { text: '03 · 所有权与 RAII', link: '/lifetime/03-ownership-raii' },
              { text: '04 · 引用与悬垂', link: '/lifetime/04-references-dangling' },
              { text: '05 · 容器与迭代器失效', link: '/lifetime/05-containers-iterators' },
              { text: '06 · 递归与回溯', link: '/lifetime/06-recursion-backtracking' },
              { text: '07 · 图算法中的生命周期', link: '/lifetime/07-graph-algorithms' },
              { text: '08 · 并发与异步', link: '/lifetime/08-concurrency-async' },
              { text: '09 · 检查清单', link: '/lifetime/09-checklist' },
            ],
          },
        ],
        '/cpp-tmp/': [
          {
            text: 'C++ 模板元编程',
            items: [
              { text: '这条路线讲什么', link: '/cpp-tmp/' },
              { text: '01 · 模板基础', link: '/cpp-tmp/01-template-basics' },
              { text: '02 · 特化与偏特化', link: '/cpp-tmp/02-specialization' },
              { text: '03 · constexpr 编译期计算', link: '/cpp-tmp/03-constexpr' },
              { text: '04 · type_traits 与 SFINAE', link: '/cpp-tmp/04-type-traits-sfinae' },
              { text: '05 · 变参模板', link: '/cpp-tmp/05-variadic-templates' },
              { text: '06 · Concepts', link: '/cpp-tmp/06-concepts' },
              { text: '07 · 实战模式', link: '/cpp-tmp/07-patterns' },
              { text: '08 · 实战：编译期格式串检查', link: '/cpp-tmp/08-format-checker' },
              { text: '09 · 实战：结构体序列化', link: '/cpp-tmp/09-serialization' },
              { text: '10 · 实战：类型擦除', link: '/cpp-tmp/10-type-erasure' },
              { text: '11 · 速查表', link: '/cpp-tmp/11-cheatsheet' },
            ],
          },
        ],
      },

      search: {
        provider: 'local',
        options: {
          translations: {
            button: {
              buttonText: '搜索文档',
              buttonAriaLabel: '搜索文档',
            },
            modal: {
              noResultsText: '没有找到结果',
              resetButtonTitle: '清除查询',
              footer: {
                selectText: '选择',
                navigateText: '切换',
                closeText: '关闭',
              },
            },
          },
        },
      },

      outline: { level: [2, 3], label: '本页目录' },
      docFooter: { prev: '上一篇', next: '下一篇' },
      lastUpdated: { text: '最后更新于' },
      returnToTopLabel: '回到顶部',
      sidebarMenuLabel: '目录',
      darkModeSwitchLabel: '主题',
      footer: {
        message: '用可被机器检查的代码，讲清那些容易被含糊带过的概念。',
        copyright: 'MetaForge · 以学习与交流为目的',
      },
    },
})
