---
title: 08 · 实战一：编译期格式串检查
description: 把格式串变成类型参数，用 consteval 解析再用 static_assert 检查占位符数量与实参类型，最后用 tuple 与折叠把它填出来
---

# 08 · 实战一：编译期格式串检查

> **一句话**：格式串里的 `{}` 和实参是两份必须对齐的信息，而它们之间的对齐规则编译器完全能算——把字符串搬进类型系统，就能在编译期把“个数不对”“类型不能打印”变成一条报错。

## 从一次崩溃说起

```cpp
std::printf("%s\n", 42);      // 运行时把 int 当指针读
```

编译器不会拦这一行。格式串只是 `const char*`，`printf` 的签名里没有一处告诉编译器“第二个参数得和第一个参数的第一个占位符对上”。于是这类错误被推到运行时：轻则输出乱码，重则崩溃，而且在日志代码里往往几个月才被发现一次。

同样的信息其实在编译期就齐了：

- 格式串是**源码里的字面量**，它的每个字符都是常量；
- 每个实参的类型在调用点已知；
- “哪些类型能被打印”也是一个编译期可判定的事实。

fmt 这个库的出发点就是把这三点接起来。这一章把它最核心的部分做一遍：一个能检查占位符数量、能检查实参类型、能正确输出的 `format`。做完之后，你会知道 fmt 的编译期检查到底靠什么，也会知道它在哪里必须退让。

## 第一步：让字符串进入类型系统

模板参数可以是类型、整数、布尔值，C++20 起还可以是**满足结构化类型要求的类对象**。标准库没有现成的字符串类型可用，自己写一个：

```cpp
template <std::size_t N>
struct fixed_string {
    char data[N]{};
    constexpr fixed_string(const char (&s)[N]) {
        for (std::size_t i = 0; i < N; ++i) data[i] = s[i];
    }
    static constexpr std::size_t size = N - 1;   // 去掉结尾的 '\0'
};
```

三个点值得说明：

- `data` 是数组、构造函数是 `constexpr`、所有成员都 public——这些条件合起来保证它**能当非类型模板参数**。C++20 把这类类型叫结构化类型（structural type）。少一个条件，`format<"{}">` 就编译不过。
- `size` 比 `N` 小 1，因为字符串字面量自带 `'\0'`。如果忘了这一步，扫描时会把 `'\0'` 当成普通字符，`"{}"` 会变成三个字符的格式串。
- 构造函数的参数是**数组引用**，不是指针。写成 `const char*` 的话 `N` 无从推导，字面量的长度信息会在传参时丢掉，模板参数也就定不下来。

于是 `"x={}"` 这个字面量在类型系统里变成了 `fixed_string<5>`，且它的内容是类型的一部分：`fixed_string<5>{"x={}"}` 和 `fixed_string<5>{"x=?}"` 是两个不同的模板实参。调用点写成：

```cpp
format<"{} + {} = {}">(1, 2, 3)
```

编译器要把字面量转换成 `fixed_string<N>`，再拿这个对象去匹配 `template <fixed_string S, class... Args>`。字面量的内容因此进入了类型推导。

## 第二步：编译期扫描

有了字符串，扫描就是普通的 `constexpr` 代码。目标是数出占位符个数，并记住第一个不配对的花括号位置：

```cpp
struct scan_result {
    std::size_t args = 0;
    std::size_t bad = std::string_view::npos;   // 第一个不合法的位置
};

constexpr scan_result scan(std::string_view s) {
    scan_result r;
    for (std::size_t i = 0; i < s.size(); ++i) {
        if (s[i] == '{') {
            if (i + 1 < s.size() && s[i + 1] == '{') { ++i; continue; }  // {{ 是字面量
            if (i + 1 < s.size() && s[i + 1] == '}') { ++r.args; ++i; continue; }
            r.bad = i;
            return r;
        }
        if (s[i] == '}') {
            if (i + 1 < s.size() && s[i + 1] == '}') { ++i; continue; }  // }} 是字面量
            r.bad = i;
            return r;
        }
    }
    return r;
}

template <fixed_string S>
constexpr scan_result info = scan(std::string_view(S.data, S.size));
```

`info<S>` 是一个变量模板：每个不同的格式串都会实例化出一份，值是编译期常量。把它写成变量模板而不是函数调用，是因为后面要在 `static_assert` 里直接引用它——`static_assert(info<S>.args == ...)` 读起来比在断言里塞一次函数调用清楚。

扫描函数用 `constexpr` 而不是 `consteval`：同一份逻辑将来可能还要用在运行时字符串上（比如从配置文件读来的格式串），`consteval` 会把这条路彻底封死。这是刻意留的余地。

## 第三步：两条断言

真正拦住错误的就是这两行 `static_assert`，分别对应两类失败：

```cpp
template <class T>
concept printable = requires(std::ostream& os, const T& v) { os << v; };

template <fixed_string S, class... Args>
std::string format(Args&&... args) {
    static_assert(info<S>.bad == std::string_view::npos,
                  "格式串里的花括号不配对；字面量的花括号要写成 {{ 和 }}");
    static_assert(info<S>.args == sizeof...(Args),
                  "占位符个数与实参个数不一致");
    static_assert((printable<std::remove_cvref_t<Args>> && ...),
                  "有实参无法用 operator<< 输出，无法格式化");
    // ...
}
```

断言失败时，Clang 给出的信息是这样的：

```text
error: static assertion failed due to requirement
  'info<fixed_string<6>{"{} {}"}>.args == sizeof...(Args)':
  占位符个数与实参个数不一致
```

注意报错里直接出现了 `fixed_string<6>{"{} {}"}`。格式串一旦进了类型，编译器在报错时就会把它原样打印出来——这是把字符串搬进类型系统最实际的好处之一。类型不对时的报错也一样定位明确：

```text
error: static assertion failed: 有实参无法用 operator<< 输出，无法格式化
note: in instantiation of function template specialization
  'mini::format<fixed_string<3>{"{}"}, std::vector<int> &>' requested here
```

这两条断言为什么能成立？因为 `info<S>` 在编译期就能求值，而 `sizeof...(Args)` 和 `printable<Args>` 本来就是编译期事实。`static_assert` 只是把已经存在的两个常量放在一起比较。

## 第四步：把值填进去

检查是编译期的事，输出是运行时的事。运行时需要按顺序把第 0、1、2 个实参交给对应的位置。最直觉的写法是 `std::vector<std::string>`：先把每个实参转成字符串，再按序号取。这个写法的代价是每个实参都要构造一个 `std::string`，即使它最终只是被原样输出。

这里用另一种做法：把实参保留在 `tuple` 里，按序号直接流式输出。

```cpp
template <class Tuple, std::size_t... I>
void emit(std::ostream& os, const Tuple& t, std::size_t n, std::index_sequence<I...>) {
    ((n == I ? (void)(os << std::get<I>(t)) : (void)0), ...);
}
```

`emit` 收到运行时的序号 `n`，展开成 `n == 0 ? os << get<0> : void()`、`n == 1 ? ...` 这样一串条件。每个分支都在编译期知道该取哪个元素、该调用哪个 `operator<<`，所以没有类型擦除，也没有字符串中转。

主循环按字符走一遍：先认出转义写法，再处理占位符，其余原样输出。

```cpp
template <fixed_string S, class... Args>
std::string format(Args&&... args) {
    // ...三条 static_assert...

    std::ostringstream os;
    const std::string_view s(S.data, S.size);
    auto tuple = std::forward_as_tuple(std::forward<Args>(args)...);
    std::size_t next = 0;

    for (std::size_t i = 0; i < s.size(); ++i) {
        if (s[i] == '{') {
            if (s[i + 1] == '{') { os << '{'; ++i; }
            else { emit(os, tuple, next++, std::index_sequence_for<Args...>{}); ++i; }
        } else if (s[i] == '}') {
            if (s[i + 1] == '}') { os << '}'; ++i; }
        } else {
            os << s[i];
        }
    }
    return os.str();
}
```

跑起来：

```cpp
format<"{} + {} = {}">(1, 2, 3);                  // 1 + 2 = 3
format<"{{literal}} {}">(std::string{"ok"});     // {literal} ok
format<"no placeholder">();                       // no placeholder
format<"{{}} 是一对字面量花括号">();              // {} 是一对字面量花括号
```

## 我们的版本和 fmt 差在哪

这个实现能跑，但它和 fmt 之间的距离恰好是“能用的示例”和“能进生产”之间的距离。差距集中在四处。

**格式语法。** 我们只认裸的 `{}`。`{0}` 的按序号引用、`{name}` 的命名参数、`{:.2f}` 的精度、`{:>8}` 的对齐全都不支持。fmt 的解析器是一个真正的状态机，把格式串切成“字面量 + 字段”的序列，再按字段里的冒号后语法解析。这部分的复杂度不在模板，在解析。

**运行时的取参方式。** 我们的 `emit` 是 `n == 0`、`n == 1` 一串比较；第 k 个占位符要比较 k+1 次，占位符一多就是平方级的判断链（编译器能折叠分支体，比较本身省不掉）。fmt 走的是另一条路：先把实参存进一个类型擦除的数组，每个元素记录“是什么类型、值在哪儿”，运行时按序号直接取。代价是一次间接寻址，换来的是 O(1) 取参和统一的 `vformat` 接口。这是两种明确不同的取舍，不是谁写得更聪明。

**调用形式。** 我们要求 `format<"{}">(x)`，fmt 允许 `fmt::format("{}", x)`。差别来自一个精巧的设计：fmt 的第一个参数是 `format_string<Args...>` 类型的对象，构造函数是 `consteval` 的，参数是数组引用，所以普通字面量能在调用点被隐式转换并当场检查。字符串一旦来自 `std::string` 或配置文件，就得显式写 `fmt::runtime(s)`——把“这是运行时的”变成一个看得见的选择。

**错误诊断的粒度。** 我们的三条断言只能告诉你“有问题”。fmt 能在编译期把每个字段和对应实参逐一比对，报错里写出“第 2 个参数是 `std::vector<int>`，它没有 formatter”。这不是模板技巧的差距，是把解析、类型检查、诊断信息三件事组织成一套管线之后的工程差距。

::: tip 一个可以立刻验证的差异
把 `{}` 写成 `{:.2f}` 交给我们的 `format`，你会得到“花括号不配对”——因为冒号之后的内容被当成普通字符，然后遇到一个孤立的 `}`。fmt 会接受它，并按两位小数输出。语法扩展的代价全在解析器里，跟模板无关。
:::

## 代价与边界

- **需要 C++20 的类类型非类型模板参数。** C++17 及以前只能退回“字符串作为模板参数”的老技巧（宏或者外部代码生成），可用性差一个量级。
- **每个不同的格式串都是一次实例化。** 一个项目里有几百条日志格式串，就有几百份 `format<...>`。格式串本身会被编译进二进制，这一点和字符串字面量没有区别；多出来的是实例化出来的代码，热路径之外通常可以接受。
- **格式串不能来自运行时。** 翻译文件、用户输入、配置文件里的格式串都没法进类型系统。这时只能做运行时解析——fmt 的 `runtime`、`vformat` 就是为这条路准备的，检查也从编译期退化为“运行时抛异常”。
- **报错仍然有模板栈。** 断言消息是我们自己写的，所以第一行永远是人话；但 `note: in instantiation of ...` 仍然会拉出一串实例化链。这是模板报错的固定税，第 01 篇讲过的读法在这里同样适用。

## 人话总结

<div class="human-note">
<strong>如果只记住一件事：</strong>编译期检查不是“让编译器更聪明”，而是<strong>把信息挪到编译器看得见的地方</strong>。格式串进类型、实参个数进 <code>sizeof...</code>、可打印性进 concept，三条断言就变成了同一件事的三种说法。
</div>

## 常见误解

**误解一：编译期检查意味着运行时没有解析成本。**

不成立。我们的实现运行时要逐字符走一遍格式串；fmt 也解析，只是解析结果直接驱动输出。编译期检查省掉的是“错误发现得晚”，不是“运行时不用读格式串”。真要省掉解析，只有一种办法：在编译期把格式串编译成一段固定的调用序列（相当于代码生成），代价是每个格式串的代码体积和灵活性。

**误解二：把字符串放进模板参数只是“炫技”。**

它解决的是一个具体问题：**字面量的内容必须成为检查的依据**。没有这一步，`static_assert` 里没有任何东西可比。fmt 的类型叫 `format_string`，本质就是这层包装。

**误解三：`static_assert` 消息写清楚就够了。**

消息只覆盖你预想到的失败。真正难查的是“格式串对了、类型也支持输出、但输出结果不符合业务预期”——比如把金额按默认精度打成了 `12.3` 而不是 `12.30`。编译期检查管不了语义，这类问题只能靠测试。

**误解四：自己写一个就够了，不必用 fmt。**

如果只需要“占位符个数对不对”，自己写三十行确实够。一旦需要精度、对齐、本地化、宽字符、颜色、运行时格式串，维护成本会迅速超过引入一个成熟库的成本。这一章的目的是让你读懂那三十行在做什么，而不是鼓励你重写 fmt。

## 本章小结

- 字符串字面量要进类型系统，需要一个满足结构化类型要求的包装；`fixed_string` 是最小实现。
- 扫描、计数、配对检查都是普通 `constexpr` 代码，`static_assert` 只是把结果拿来比较。
- 实参类型检查用 concept 表达“能 `<<` 到 `ostream`”；这比 SFINAE 版本短得多，报错也更直接。
- 运行时填充用 `tuple` + `index_sequence`，保持每个实参的静态类型；代价是按序号的分支判断。
- 与 fmt 的真实差距在格式语法、取参结构和诊断粒度上，不在模板语法本身。

## 练习

1. **加上 `{0}` 的序号引用。** 要求 `format<"{1} {0}">("a", "b")` 输出 `b a`，并且 `{2}` 在只有两个实参时是编译错误。提示：`scan` 要在编译期把每个占位符的序号存下来，`static_assert` 检查最大值小于 `sizeof...(Args)`。
2. **改造成 fmt 的调用形式。** 写一个 `format_string<Args...>` 包装类，让 `format("{}", 42)` 不需要写 `<"...">` 也能编译；再让它接受 `std::string` 时报错，并提示改用 `runtime_format(s)`。
3. **测量实例化成本。** 写 20 条不同的格式串，用 `clang++ -ftime-trace` 或 `-H` 观察编译时间；再把这 20 条换成运行时字符串走同一个函数，对比二进制大小和编译时间。结论写清楚：多出来的是哪一部分。
4. **找出一个 fmt 能查、我们查不了的错误。** 例如 `{:.2f}` 作用在 `std::string` 上、或者 `{0}` 与 `{}` 混用。说明为什么这个错误需要“解析器 + 类型检查”联合工作，而不是一条 `static_assert` 能解决的。

---

下一篇：[09 · 实战二：把结构体自动变成 JSON](/cpp-tmp/09-serialization)
