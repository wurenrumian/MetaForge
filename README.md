# MetaForge

一个用 VitePress 搭建的技术学习站点，包含三条相对独立的路线：

| 路线 | 内容 | 入口 |
| --- | --- | --- |
| 类型论 × Agda | 类型、归纳类型、依赖类型、命题即类型、等式与证明、宇宙 | `/type-theory/` |
| 算法中的生命周期 | 栈帧、RAII、悬垂引用、迭代器失效、回溯、图算法、并发异步 | `/lifetime/` |
| C++ 模板元编程 | 模板实例化、特化、`constexpr`、SFINAE、变参模板、Concepts | `/cpp-tmp/` |

## 本地开发

要求 Node.js 18+。

```bash
npm install
npm run dev        # 开发服务器，默认 http://localhost:5173
npm run build      # 构建到 docs/.vitepress/dist
npm run preview    # 预览构建结果
```

## 目录结构

```text
docs/
  .vitepress/
    config.mts       # 站点配置、导航、侧边栏、搜索
    theme/           # 默认主题 + 少量自定义样式
  index.md           # 首页
  guide/             # 阅读指南
  type-theory/       # 类型论路线（9 篇）
  lifetime/          # 生命周期路线（10 篇）
  cpp-tmp/           # C++ 模板路线（9 篇）
  public/            # 静态资源（logo 等）
content-guide.md     # 内容制作规范（给写作 Agent/贡献者）
```

## 内容约定

- 中文写作，术语首次出现给英文。
- 每章包含：一句话结论、具体问题切入、人话解释、常见误解、小结、练习。
- Agda 示例尽量自包含，不依赖标准库；C++ 示例默认 C++20。
- 可用 `::: tip` / `::: warning` / `::: details` 容器与 Mermaid 语法图表（构建期由 **Pele** 渲染成静态 SVG）。
- 详细规范见 [`content-guide.md`](./content-guide.md)。

## Agda 环境

阅读不需要安装 Agda。想动手时可以用：

- [Agda Pad](https://agdapad.quasicoherent.io/)（零安装）
- 本地 Agda 2.6.3+（推荐 2.8.x），标准库可选
- Emacs `agda2-mode` / Neovim `Cornelis` / Vim `agda-vim`

本站的 Agda 代码按“自包含单文件”编写，可以直接粘进 Agda Pad 或本地 `.agda` 文件。

## 部署

`npm run build` 生成静态文件，`docs/.vitepress/dist/` 可以部署到任意静态托管（GitHub Pages、Netlify、Vercel、Cloudflare Pages 等）。

如果部署到 GitHub Pages 的子路径，需要在 `docs/.vitepress/config.mts` 里设置 `base`，例如：

```ts
export default defineConfig({
  base: '/your-repo-name/',
  // ...
})
```
