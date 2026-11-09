---
title: 10 · 实战三：类型擦除——模板装不进容器时
description: 手写一个基于 vtable 的 Task，把任意可调用对象装进同一个容器；再对比编译期注册表与 constexpr 哈希分派，最后用实测数据说明这次间接调用值不值
---

# 10 · 实战三：类型擦除——模板装不进容器时

> **一句话**：模板给你“每个类型一份最优代码”，但不给你“一个能装下所有类型的容器”；类型擦除就是花一次间接调用，把那容器买回来。

## 一个装不进去的队列

第 07 篇的 CRTP 有一个结论：`Shape<Circle>` 和 `Shape<Square>` 之间没有任何关系，所以 `std::vector<Shape*>` 装不下它们。当时给出的退路是虚函数——可是虚函数要求被装的类型**继承自同一个基类**。

真实代码里经常没有这个条件。一个任务队列可能装这些东西：

```cpp
queue.push([]{ std::puts("lambda"); });
queue.push(std::bind(&Handler::run, &h, 42));
queue.push(std::function<void()>{[]{ /* ... */ }});
queue.push(SomeFunctor{});
```

四个类型互不相干，也不能为了进队列去改它们的定义（其中一个来自第三方库）。把这四种东西放进同一个 `std::array` 的唯一办法，是让它们先变成**同一个类型**。这个“变成同一个类型”的动作，就是类型擦除（type erasure）。

三条路各自能做什么，先摆清楚：

| 方案 | 有统一类型吗 | 要求被包装的类型做什么 | 每次调用成本 |
| --- | --- | --- | --- |
| 虚函数 + 基类 | 有 | 必须继承、必须改定义 | 一次间接调用 |
| 模板参数 | 没有 | 什么都不用做 | 可内联，通常零成本 |
| 类型擦除 | 有 | 什么都不用做 | 一次间接调用，外加可能的堆分配 |

类型擦除的位置很特别：它保留了模板“不要求改类型”的优点，又拿回了虚函数“有统一类型”的能力。代价写在最后一列。

## 结构：一份表，两个指针

`std::function` 的本质可以用两句话说完：**每个被包装的类型生成一张函数表，对象里存这张表的指针和数据的指针。**

先看表：

```cpp
class Task {
    struct ops {
        void (*call)(void*);     // 怎么调用
        void (*kill)(void*);     // 怎么销毁
    };

    template <class F>
    struct box {
        F fn;
        static void call(void* p) { (*static_cast<F*>(p))(); }
        static void kill(void* p) { delete static_cast<F*>(p); }
        static constexpr ops table{&call, &kill};
    };

    const ops* ops_ = nullptr;
    void* self_ = nullptr;

public:
    // ...
};
```

`box<F>` 是一个模板，但它**从不以 `box` 的身份出现**。外面只知道 `ops_` 和 `self_`：前者指向一张由 `F` 决定的表，后者指向堆上的那个 `F` 对象。`box<F>` 的差异被这两个指针抹平了。

`table` 是 `static constexpr` 的成员：每个 `F` 一份，编译期就定下来，运行时只取地址。这正是“手写虚表”的含义——编译器给多态类生成的那张表，我们这里用模板和静态成员手工造了一份。

为什么 `call`/`kill` 是静态函数而不是成员函数？因为它们要通过 `void*` 调用，而 `void*` 上没有类型信息，无法做成员函数调用。静态函数拿到 `void*` 后自己转回 `F*`，类型信息由“哪个 box 提供了这个函数”携带。

构造函数负责把类型装进去：

```cpp
template <class F>
    requires(!std::same_as<std::remove_cvref_t<F>, Task>) &&
            std::invocable<std::remove_cvref_t<F>&>
Task(F&& f)
    : ops_(&box<std::remove_cvref_t<F>>::table),
      self_(new std::remove_cvref_t<F>(std::forward<F>(f))) {}
```

两个约束都不能省：`remove_cvref_t<F> != Task` 防止 `Task t2(t1)` 走进模板构造函数跟拷贝构造函数抢；`invocable<F&>` 让“传了个整数”在构造处就报错，而不是等到调用时。`std::forward` 保证左值拷贝、右值移动，和 `std::function` 的行为一致。

移动与销毁：

```cpp
Task(Task&& other) noexcept : ops_(other.ops_), self_(other.self_) {
    other.ops_ = nullptr;
    other.self_ = nullptr;
}

~Task() { clear(); }

void operator()() const { ops_->call(self_); }
```

移动之后源对象置空，是因为 `kill` 会 `delete` 那块内存；不置空就是双重释放。拷贝被删除（`Task(const Task&) = delete`），因为这层擦除只存了“怎么调用”和“怎么销毁”，没有存“怎么复制”。想让 `Task` 可拷贝，得在 `ops` 里再加一列 `clone`——`std::function` 就是这么做的，代价是所有被包装的类型必须可拷贝。

到这里，异构容器就能写了：

```cpp
long long counter = 0;
std::array<Task, 3> tasks{
    Task{[&] { counter += 1; }},
    Task{[&] { counter += 2; }},
    Task{[&, s = std::string_view{"hi"}] { counter += s.size(); }},
};
for (const auto& t : tasks) t();      // counter == 5
```

三种不同的闭包类型，经过 `Task` 之后成了同一个类型。这是模板和继承都给不了的东西。

## 另一半：把“类型”本身也放到运行时可寻址的地方

类型擦除解决的是“值”，编译期注册表解决的是“类型名 → 行为”。真实项目里这两件事经常一起出现：插件表、命令表、反序列化工厂。

最小的版本用不上运行时容器，只要一个类型列表：

```cpp
struct cmd_help {
    static constexpr std::string_view name = "help";
    static void run() { std::puts("usage: app [options]"); }
};

struct cmd_version {
    static constexpr std::string_view name = "version";
    static void run() { std::puts("app 0.1"); }
};

template <class... Cmds>
struct command_table {
    static constexpr std::size_t size = sizeof...(Cmds);

    static void install(std::map<std::string_view, void (*)()>& m) {
        (m.emplace(Cmds::name, &Cmds::run), ...);
    }
};

using commands = command_table<cmd_help, cmd_version>;
```

`(m.emplace(...), ...)` 是一元右折叠：对每个 `Cmd` 执行一次 `emplace`。新增命令只需要写一个结构体、把它加进 `commands` 的模板实参列表，注册代码一行都不用动。

这和 03 篇的 `consteval` 哈希 + `switch` 是同一个问题的两种答案：

| | 编译期哈希 + `switch` | 注册表 + `map` |
| --- | --- | --- |
| 查找时机 | 编译期确定跳转目标 | 运行时查表 |
| 未知命令 | 可以 `default` 兜底 | 查不到就是查不到 |
| 新增命令 | 改 `case`，重编译 | 加类型，重编译（模板实参变了） |
| 动态加载 | 做不到 | 可以，`install` 能接收运行时数据 |

注意最后一行：模板参数必须在编译期已知，所以“注册表”如果真要支持插件动态加载，`command_table` 只负责**编译期已知的那部分**，剩下的得走运行时接口。这也是为什么大型项目最后往往两种都保留。

## 实测：这次间接调用值多少

说“类型擦除有一次间接调用”是定性描述，值不值得要看数字。下面这段基准在本机跑出来的结果（Windows，clang 23.1，`-O2`，每次 5000 万次调用，`run_n` 标记 `noinline` 防止循环被提前内联）：

```cpp
template <class F>
__attribute__((noinline)) void run_n(F&& f, int n) {
    for (int i = 0; i < n; ++i) f();
}

auto lambda = [&x] { ++x; };
Task task{[&x] { ++x; }};
std::function<void()> erased = [&x] { ++x; };

measure(lambda);   // 直接调用
measure(task);     // 手写类型擦除
measure(erased);   // std::function
```

```text
    0.00 ns/call  (x=50000000)     // 循环被整体折叠成 x += N
    0.85 ns/call  (x=50000000)
    0.86 ns/call  (x=50000000)
```

三行结果的解读比数字本身重要：

- 第一行不是“零成本”，而是**测试被优化掉了**。编译器看到 `lambda` 的内容是 `++x`，直接把整个循环折成一次加法。这恰好说明静态分派的上限：调用点、被调函数、循环边界全在编译期可见，可以一起优化。
- 后两行约 0.85 ns，约等于 2–3 个周期，与“一次间接跳转 + 不能内联”的量级吻合。手写版本和 `std::function` 几乎一样，说明差距不在实现细节，而在机制本身。
- 这个数字**不能直接外推**到你的项目：真实回调体通常比 `++x` 重得多，间接调用的相对占比会下降；反过来，如果回调体只有几行、又在热循环里，0.85 ns 乘以调用次数就很可观。测量方法可以照抄，结论必须自己跑。

本机数据还掩盖了一件事：我们的 `Task` 每次构造都 `new` 一块内存，而 `std::function` 有**小对象优化**（small buffer optimization, SBO），闭包足够小就存在对象内部，不碰堆。示例里三个 `Task` 就是三次分配。生产实现要不要做 SBO，取决于“构造频率高不高”和“对象大小能不能接受”，这是另一个取舍，本章不展开。

## 真实库里的同一件事

| 库/设施 | 擦掉了什么 | 值得注意的细节 |
| --- | --- | --- |
| `std::function` | 可调用对象的类型 | 要求可拷贝；小对象优化；空 `std::function` 调用抛 `bad_function_call` |
| `std::move_only_function`（C++23） | 同上，但只要求可移动 | 本章 `Task` 就是它的简化版 |
| `std::any` | 任意值类型 | 要求可拷贝；取值要 `any_cast`，取错抛异常 |
| `std::shared_ptr<T>` 的删除器 | 删除器与分配器的类型 | 控制块里存函数指针；`shared_ptr<void>` 能装任意指针 |
| `llvm::function_ref` | 可调用对象的类型，但不拥有 | 只存指针 + 函数指针，拷贝极便宜；生命周期由调用方保证 |
| range-v3 的 `any_view` | 具体 view 类型 | 让不同 pipeline 的结果能放进同一容器，代价是失去内联 |
| EnTT 的注册表 | 类型身份 | 把类型编译成运行时整数，用稀疏集按类型存数据 |

共同点：**擦除的不是“类型安全”，而是“类型在编译期的可见性”**。接口层面仍然是类型安全的（`Task` 只能被调用，不能当 `int` 用），只是编译器不再知道背后究竟是哪个 `F`。

## 代价与边界

- **不能内联。** 这是主要成本，也是唯一无法通过实现技巧消除的成本。`operator()` 里那次 `ops_->call(self_)` 对编译器是不透明的，内联、常量传播、跨调用优化全断在这里。
- **堆分配。** 我们的版本每次构造都分配；`std::function` 用 SBO 回避大部分小对象。分配成本往往比间接调用更高，尤其在构造频繁的路径上。
- **错误从编译期挪到运行时。** 空 `Task` 调用是 UB（我们的实现直接解引用空指针），`std::function` 选择抛异常。类型擦除换来的灵活性，代价之一就是这类检查做不到了。
- **调试与 ABI。** 栈回溯里看到的是 `box<F>::call`，不是调用点的业务函数；跨动态库传递擦除对象要求两边对 `ops` 布局有共识，所以真实库都把它藏在实现文件里，只暴露稳定的接口。
- **二进制体积。** 每个被包装的类型生成一张表和两个函数，通常很小；但和模板版本比，你失去了“同一份代码服务所有类型”的链接器合并机会。

## 人话总结

<div class="human-note">
<strong>如果只记住一件事：</strong>类型擦除是<strong>用一次间接调用，换一个统一类型</strong>。它不要求被包装的类型继承、也不需要改它们的定义；代价是编译器再也看不见背后是谁，内联和优化到此为止。
</div>

## 常见误解

**误解一：类型擦除就是虚函数换了个名字。**

差别在“谁被要求配合”。虚函数要求类型**在设计时就继承基类**；类型擦除对类型零要求，包装发生在使用侧。`std::function` 能装一个第三方库的回调，虚拟基类做不到——因为你改不了那个库。

**误解二：`std::function` 慢，所以应该避免。**

慢的是“在热循环里每轮调一次”。如果回调一次要干几毫秒的活，0.85 ns 的间接调用占比可以忽略；反过来，在一个每秒调用上亿次的过滤器里，它确实会成为瓶颈。判断依据是调用频率和回调体大小，不是“用了 `std::function`”这个事实。

**误解三：手写 vtable 比 `std::function` 快。**

实测几乎一样。手写的价值在于**控制**：能做成 move-only、能省掉异常、能定制 SBO、能加自己的调试钩子。性能不是理由。

**误解四：编译期注册表能完全替代运行时注册。**

不能。`command_table<Cmds...>` 的 `Cmds` 必须在编译期已知，插件在运行时 `dlopen` 出来的类型进不了模板实参。真实系统通常是“编译期表负责内置命令，运行时表负责插件”，两张表在启动时合并。

## 本章小结

- 类型擦除 = 每个类型一张函数表 + 对象里存表指针和数据指针；被包装的类型零要求。
- 手写 `ops` 表要同时解决调用、销毁和（可选的）复制；`requires` 约束防止构造函数抢走拷贝/移动。
- 编译期注册表用折叠把类型列表变成运行时表；和 `consteval` 哈希分派相比，一个查表、一个跳转，动态能力不同。
- 本机实测：直接调用被完全折叠，擦除调用约 0.85 ns/次，与 `std::function` 持平。
- 真实库的分歧在所有权、可拷贝性、SBO 与生命周期策略，不在“擦不擦”本身。

## 练习

1. **给 `Task` 加 SBO。** 用 `std::byte[32]` 的内部缓冲区，加上对齐处理：对象足够小且可移动时放缓冲区，否则堆分配。要求 `sizeof(Task)` 不超过 48 字节，并用 `static_assert` 固定下来。
2. **给 `Task` 加 `clone`。** 让 `Task` 可拷贝，然后对比：哪些闭包类型因此无法再装进去？`std::function` 的约束是不是同一个原因？
3. **把命令表改成 `consteval` 哈希分派。** 用 03 篇的 `fnv1a` 写一个 `dispatch("help")`，和 `command_table` 版本比较：代码量、未知命令的处理、能否接收运行时字符串。
4. **做一次自己的基准。** 把回调体换成“对一个 `std::vector` 求和”这类真实工作，重新测量直接调用、`Task`、`std::function` 的差距。结论要包含：回调体多大时，间接调用的开销可以忽略。

---

下一篇：[11 · 速查表](/cpp-tmp/11-cheatsheet)
