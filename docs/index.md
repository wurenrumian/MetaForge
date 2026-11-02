---
layout: home
hero:
  name: MetaForge
  text: 把抽象锻造成直觉
  tagline: 用 Agda 亲手检查类型论，用真实代码追踪算法中的生命周期，再用 C++ 模板看见编译期的另一种“计算”。
  image:
    src: /logo.svg
    alt: MetaForge
  actions:
    - theme: brand
      text: 从阅读指南开始
      link: /guide/
    - theme: alt
      text: 直接进入类型论
      link: /type-theory/
features:
  - icon: 🧩
    title: 类型论 × Agda
    details: 不背定义。用 Agda 把“类型、命题、证明、程序”写成同一件事，让机器帮你检查每一步推理。
    link: /type-theory/
    linkText: 开始学习
  - icon: ♻️
    title: 算法中的生命周期
    details: 从栈帧、RAII 到迭代器失效、图遍历和异步回调，用“谁在什么时候还活着”解释常见 bug。
    link: /lifetime/
    linkText: 看清生命周期
  - icon: ⚙️
    title: C++ 模板元编程
    details: 模板不是魔法。从推导、特化、SFINAE 到 constexpr 与 Concepts，建立一张可操作的编译期地图。
    link: /cpp-tmp/
    linkText: 拆开模板
---

<div class="home-section">
  <h2>三条路线，三种“看代码”的方式</h2>
  <p class="lead">
    同一个程序，可以从三个高度去看：最底下是“值在什么时候存在”，中间是“类型允许什么操作”，
    最上面是“命题能不能被证明”。这三条路线各自独立，又会在你不经意的时候接上。
  </p>

  <div class="track-grid">
    <a class="track-card" href="/type-theory/">
      <span class="track-kicker">Track 01 · 逻辑与证明</span>
      <h3>类型论 × Agda</h3>
      <p>
        先把“类型”从语法装饰变回它本来的样子：一个关于值的承诺。然后用依赖类型写下
        “长度恰好为 n 的向量”，让编译器替你检查边界。
      </p>
      <span class="track-meta">9 篇 · 从零开始的交互式证明</span>
    </a>

    <a class="track-card" href="/lifetime/">
      <span class="track-kicker">Track 02 · 资源与时间</span>
      <h3>算法中的生命周期</h3>
      <p>
        为什么 <code>vector</code> 扩容后旧迭代器会失效？为什么递归回溯要“恢复现场”？
        为什么异步回调里捕获的引用会变成悬垂引用？答案都藏在生命周期里。
      </p>
      <span class="track-meta">10 篇 · C++ 为主，横向对照多门语言</span>
    </a>

    <a class="track-card" href="/cpp-tmp/">
      <span class="track-kicker">Track 03 · 编译期工程</span>
      <h3>C++ 模板元编程</h3>
      <p>
        模板实例化、特化、SFINAE、<code>constexpr</code>、Concepts——
        这些名词背后是一条清晰的演化线：让编译器在运行前把能算的都算完。
      </p>
      <span class="track-meta">9 篇 · 现代 C++ 视角，不要求类型论基础</span>
    </a>
  </div>
</div>

<div class="route-note">
  <h3>建议的阅读顺序</h3>
  <p>
    如果你完全没接触过类型论：按 <strong>类型论 → 生命周期 → C++ 模板</strong> 的顺序读，
    先建立“类型是命题”的视角，再回到工程里看资源与时间。
  </p>
  <p>
    如果你只想解决实际问题：直接从 <strong>算法生命周期</strong> 开始，遇到“为什么这样写会崩”
    再回查前面的章节。C++ 模板那条线可以完全独立阅读。
  </p>
</div>
