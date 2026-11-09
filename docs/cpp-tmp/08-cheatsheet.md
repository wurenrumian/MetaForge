---
title: 08 · 速查表
description: C++20 模板语法、推导转发、特化、constexpr、traits、Concepts、变参折叠与常见报错的对照速查页
---

# 08 · 速查表

> **一句话**：这一页是工具。写模板时按“我要写什么”找表，报错时按“编译器说了什么”找原因；每条都只给最小可用形态和最常见的坑。

## 怎么用这一页

- 基准版本是 C++20。标了 `C++23` 的条目需要更新的标准支持，标了 `C++17` 的条目在更早的标准里不可用。
- 三个入口：① 忘了语法 → 第 1 到 7 节；② 编译不过 → 第 8 节“常见报错速查”；③ 不知道选哪个工具 → 第 9 节决策表。
- 表里的代码都是片段，不是完整程序；需要 `#include` 的地方在对应行里写出来了。
- 每条只记一件事：它做什么 + 最容易错的地方。细节回看对应章节。

| 我想查 | 去哪节 |
| --- | --- |
| 模板怎么声明（函数/类/别名/变量/非类型参数） | 1 |
| `auto`、`decltype`、`T&&`、`forward` 的区别 | 2 |
| 全特化、偏特化、函数模板该用哪个 | 3 |
| `constexpr` / `consteval` / `constinit` / `if constexpr` | 4 |
| `<type_traits>` 里到底有哪个 | 5 |
| Concepts 的四类 `requires` 要求、标准 concepts 列表 | 6 |
| 参数包、`sizeof...`、四种折叠 | 7 |
| 这个报错先看哪里 | 8 |
| 该用虚函数还是模板、`if constexpr` 还是 Concepts | 9 |
| 接下来读什么 | 10 |

## 1 · 模板声明语法

| 形态 | 写法 | 备注 |
| --- | --- | --- |
| 函数模板 | `template <class T> T max(T a, T b);` | `class` 与 `typename` 等价，约定用 `typename` 或 `class` 保持统一 |
| 类模板 | `template <class T, std::size_t N> struct Arr;` | 成员函数在类外定义时要重复模板头 |
| 成员模板 | `struct S { template <class U> void g(U); };` | 类外定义：`template <class T> template <class U> void S<T>::g(U) {}`（两个 `template`） |
| 变量模板 | `template <class T> constexpr T pi = T(3.14159);` | C++14；用法 `pi<double>` |
| 别名模板 | `template <class T> using Vec = std::vector<T, MyAlloc<T>>;` | 别名模板**不能**特化，也不能被推导出来 |
| 非类型参数 | `template <int N> struct Fixed;` | 枚举类型一直可以；C++20 起可用浮点与字面量类类型。指针/引用参数有链接要求 |
| 模板模板参数 | `template <template <class> class C, class T> struct Wrap;` | C++17 起可写 `template <class...> class C` 接受任意参数个数 |
| 默认模板实参 | `template <class T = int> struct Box;` | 类模板常用；函数模板也能用（C++11 起），但默认值只在该参数推导不出来时才生效 |
| 显式实例化 | `template class Vec<int>;` | 反向操作是 `extern template class Vec<int>;`（C++11），用来抑制其他翻译单元里的隐式实例化 |
| 友元模板 | `template <class U> friend class Box;` | 常用于让 `Box<T>` 访问 `Box<U>` 的私有成员 |

## 2 · 推导与转发

| 写法 | 得到什么 | 坑 |
| --- | --- | --- |
| `auto x = e;` | 值；丢掉 `const`、引用、顶层 cv | 拷贝；`auto` 从花括号初始化推导为 `std::initializer_list` |
| `auto& x = e;` | 左值引用 | 绑定右值/临时对象会失败（`const auto&` 才可以延长生命周期） |
| `const auto& x = e;` | 常引用 | 可以绑临时对象，但不要把它当“总能用”的默认选择：语义上表达的是只读 |
| `auto&& x = e;` | 转发引用；按值类别绑定，保留 `const` | 只在类型被推导时成立 |
| `template <class T> void f(T&& x)` | 转发引用 | 写成 `std::vector<T>&&` 就是普通右值引用 |
| `decltype(e)` | 若 `e` 是名字，取声明类型；否则按值类别 | 这是 `decltype` 与 `decltype((e))` 的唯一区别 |
| `decltype((e))` | 永远按值类别：左值 → `T&`，将亡值 → `T&&`，纯右值 → `T` | 多一层括号常改变结果 |
| `std::declval<T>()` | 返回 `T&&` 的“假想值” | **只能在未求值上下文**用（`decltype`、`sizeof`、`noexcept`） |
| `std::forward<T>(x)` | 有条件地转成右值：`T` 是左值引用时保持左值 | 忘记用 → 右值退化成左值，触发多余的拷贝 |
| `std::move(x)` | 无条件转成右值 | 它**不移动任何东西**；对 `const` 对象用会静默退化为拷贝 |
| `std::as_const(x)` | `const T&` | C++17；防止误调用非 const 重载 |

```cpp
template <class T>
void relay(T&& x) {
    sink(std::forward<T>(x));   // 少了 forward，右实参会以左值传入 sink
}
```

## 3 · 特化

| 需求 | 写法 | 规则 |
| --- | --- | --- |
| 为某个具体类型换实现 | `template <> struct X<int> { };` | 全特化；主模板必须先声明 |
| 为一族类型换实现 | `template <class T> struct X<T*> { };` | 偏特化；只有类模板和变量模板可以 |
| 函数模板想要“特化” | 直接加重载 | 函数模板不能偏特化；全特化可以但**不参与重载决议**，容易被意外绕过 |
| 变量模板特化 | `template <> constexpr int X<int> = 1;` | C++14 起 |
| 类模板的成员函数特化 | `template <> void X<int>::f() { }` | 成员函数可以全特化，不能偏特化 |
| 只对某些类型开放 | `template <class T> requires C<T> struct X<T*> { };` | C++20 起偏特化也能带 `requires` 子句，比 `enable_if` 偏特化可读 |

::: warning 函数模板别用特化
给函数模板写全特化，调用时可能因为重载决议先选中主模板，特化版本永远走不到——这是标准规定的行为。要特化行为，改成普通重载，或者对类模板做特化。
:::

## 4 · constexpr 家族

| 关键字 | 含义 | 注意 |
| --- | --- | --- |
| `constexpr`（变量） | 可以在常量表达式中使用 | 不保证真的在编译期求值，除非用在需要常量的位置 |
| `constexpr`（函数） | 可以在编译期求值 | 也接受运行期实参；函数体里不能有 `goto`、`try` 块、`asm`（C++23 也没放开） |
| `consteval` | **必须**在编译期求值（immediate function） | C++20；传运行期值直接编译错误 |
| `constinit` | 静态存储期变量必须常量初始化 | C++20；变量本身仍可修改（对比 `constexpr` 隐含 `const`） |
| `if constexpr` | 按编译期条件丢弃分支 | C++17；被丢弃的分支**不实例化**，所以可以写只在某类型下合法的代码 |
| `static_assert(cond, "msg")` | 编译期断言 | C++17 起可省略消息：`static_assert(cond);` |
| `consteval` 里的 `throw` | 编译期失败路径 | 可以写，但一旦求值到它编译就失败 |
| `std::is_constant_evaluated()` | 判断当前是否在常量求值中 | C++20；C++23 有更清楚的 `if consteval` |

```cpp
constexpr int fact(int n) { return n <= 1 ? 1 : n * fact(n - 1); }
static_assert(fact(5) == 120);
static_assert([]{ return 1; }() == 1);      // constexpr lambda 在 C++17 起可用
```

## 5 · 常用 `<type_traits>`

| 类别 | 常用项 |
| --- | --- |
| 分类（`*_v` 变量模板） | `is_integral_v` `is_floating_point_v` `is_arithmetic_v` `is_pointer_v` `is_class_v` `is_enum_v` `is_same_v` `is_convertible_v` `is_constructible_v` `is_trivially_copyable_v` `is_nothrow_move_constructible_v` `is_invocable_v` `is_invocable_r_v` |
| 去修饰 | `remove_cv_t` `remove_reference_t` `remove_cvref_t`（C++20）`decay_t` |
| 加修饰 | `add_const_t` `add_lvalue_reference_t` `make_signed_t` `make_unsigned_t` `underlying_type_t` |
| 条件选择 | `conditional_t<B, T, F>` `enable_if_t<B, T = void>` `bool_constant<B>` `integral_constant<T, v>` |
| 检测辅助 | `void_t<Ts...>`（SFINAE 检测惯用法的基础）`declval<T>()` |
| 类型计算 | `common_type_t<A, B>` `invoke_result_t<F, Args...>` `iterator_traits<It>::value_type` `tuple_element_t<I, Tuple>` |
| 值计算 | `is_same_v`、`std::size`（C++17）、`std::ssize`（C++20） |

```cpp
// void_t 检测惯用法：有 value_type 才启用这个重载
template <class T, class = void>
struct has_value_type : std::false_type {};

template <class T>
struct has_value_type<T, std::void_t<typename T::value_type>> : std::true_type {};
```

**`decay_t` 到底做了什么**：去掉引用 → 去掉 cv → 数组转指针 → 函数转函数指针。它模拟“按值传参”后的类型，所以在需要“值语义”的地方用它，而不是 `remove_reference_t`。

## 6 · Concepts（C++20）

| 形态 | 写法 |
| --- | --- |
| 定义 | `template <class T> concept C = requires(T a) { a.foo(); };` |
| 只用已有 trait | `template <class T> concept Integral = std::is_integral_v<T>;` |
| `requires` 子句 | `template <class T> requires C<T> void f(T);` |
| 受约束参数 | `template <C T> void f(T);` |
| 简写 | `void f(C auto x);` |
| 组合 | `C<T> && D<T>`、`C<T> \|\| D<T>`、`!C<T>`（慎用，破坏排序直觉） |
| 当布尔用 | `static_assert(C<int>);`、`if constexpr (C<T>) { }` |

**`requires` 表达式的四类要求**（完整说明见 [06 · Concepts](/cpp-tmp/06-concepts)）：

| 类型 | 写法 | 检查什么 |
| --- | --- | --- |
| 简单要求 | `a + b;` | 表达式合法即可 |
| 类型要求 | `typename T::value_type;` | 类型存在且合法 |
| 复合要求 | `{ e } noexcept -> std::convertible_to<int>;` | 合法 + `noexcept` + `decltype((e))` 满足约束 |
| 嵌套要求 | `requires sizeof(T) == 8;` | 另一个约束/常量表达式被满足 |

| 标准 concepts | 含义 |
| --- | --- |
| `std::same_as<T, U>` | 类型完全相同（双向蕴含） |
| `std::convertible_to<From, To>` | 可隐式且显式转换 |
| `std::derived_from<D, B>` | `D` 公有继承自 `B` |
| `std::integral` / `std::floating_point` | 整数 / 浮点 |
| `std::assignable_from` / `std::swappable` | 可赋值 / 可交换 |
| `std::movable` / `std::copyable` / `std::semiregular` / `std::regular` | 逐级增强的语义要求 |
| `std::invocable<F, Args...>` / `std::predicate` | 可调用 / 返回 bool 的可调用 |
| `std::equality_comparable` / `std::totally_ordered` | 可比较相等 / 全序 |
| `std::ranges::range` / `sized_range` / `input_range` … `contiguous_range` | 范围及其能力层级 |
| `std::ranges::view` / `borrowed_range` | 视图 / 迭代器生命周期不依赖范围对象 |

## 7 · 变参与折叠

| 语法 | 含义 |
| --- | --- |
| `template <class... Ts> void f(Ts... args);` | 参数包；`Ts` 是类型包，`args` 是值包 |
| `sizeof...(Ts)` | 包中元素个数（编译期常量） |
| `(pack op ...)` | 一元右折叠：`E1 op (E2 op E3)` |
| `(... op pack)` | 一元左折叠：`(E1 op E2) op E3` |
| `(init op ... op pack)` | 二元左折叠，带初值 |
| `(pack op ... op init)` | 二元右折叠，带初值 |
| `(std::cout << ... << args);` | 左折叠打印整个包 |
| `(f(args), ...);` | 逗号折叠，按顺序调用每个元素 |
| `std::index_sequence` / `std::make_index_sequence<N>` | C++14；把包展开成下标序列 |
| `std::apply(f, tuple)` | C++17；把 tuple 展开成实参 |
| `std::make_from_tuple<T>(tuple)` | C++17；用 tuple 构造对象 |

::: tip 空包的折叠结果
一元折叠遇到空包时：`&&` → `true`，`||` → `false`，`,` → `void()`。其他运算符（`+`、`*` 等）**空包无法推导**，必须写成带初值的二元折叠。
:::

变参 + 完美转发的标准骨架：

```cpp
template <class F, class... Args>
decltype(auto) call(F&& f, Args&&... args) {
    return std::forward<F>(f)(std::forward<Args>(args)...);
}
```

## 8 · 常见报错速查

| 报错（大意） | 先看哪里 | 常见原因 |
| --- | --- | --- |
| `no matching function for call to 'f(X)'` | 候选列表里第一条 `candidate:`，以及它下面的 `note:` | 实参类型没有精确匹配；约束不满足；重载被隐藏（派生类同名函数遮蔽基类） |
| `template argument deduction/substitution failed` | 紧跟其后的第一条 `note:` | 传了 `const T*` 给 `T*`；传了花括号列表推导不出 `T`；`constraints not satisfied` 后面会点名失败的 concept |
| `constraints not satisfied` / `'double' does not satisfy 'integral'` | 提示里的 concept 名字和类型 | 类型确实不满足；也可能约束写太严（多要求了一个用不到的操作） |
| `'x' was not declared in this scope, and no declarations were found by ADL` | 出错位置是否在模板里引用了基类成员 | 依赖名（dependent name）需要写 `this->x` 或 `Base<T>::x` |
| `incomplete type used in nested name specifier` | 被使用的类型有没有完整定义 | 只前置声明就取了成员/`sizeof`；type list 的 `index_of` 找不到元素也会变成这个报错 |
| `no type named 'type' in 'std::enable_if<false, void>'` | 这个 `enable_if` 的条件 | 条件为假 → 该重载被移出候选集；把条件翻译成人话就能定位 |
| `redefinition of 'f'` | 两处声明是否只差默认模板参数 | C++17 里用 `enable_if` 做两个重载的典型错误，改用 Concepts 或额外形参 |
| `use of deleted function` | 谁删掉了它 | 声明了析构函数/拷贝构造 → 隐式移动被删除；`= delete` 的显式禁用 |
| `... is not a constant expression` | 表达式里用了什么 | 用了运行期变量、未初始化的值；C++20 之前常量求值里不能出现 `new` |
| `undefined reference to 'X<int>::f()'` | 定义在哪个文件 | 模板定义写进了 `.cpp`（应放头文件），或显式实例化缺失 |

## 9 · 该用什么工具

| 需求 | 首选 | 备选 | 别用 |
| --- | --- | --- | --- |
| 一组类型共享接口，运行期选择实现 | 虚函数 | `std::function`、`variant` + `visit` | CRTP（没有统一类型） |
| 同接口、类型编译期固定、调用在热点上 | CRTP | 直接写普通模板函数 | 虚函数（看不出收益时） |
| 按编译期条件选一段实现 | `if constexpr` | 标签分派 | SFINAE（可读性最差） |
| 限制函数接受的类型 | Concepts | `enable_if`（C++17） | 只写注释 |
| 需要“更严格的重载优先” | Concepts 的约束包含 | 标签分派 | `enable_if`（无法排序） |
| 运行期异构集合 | `std::variant` + `visit` | 基类指针 + 虚函数 | type list |
| 编译期类型集合 | type list | `std::tuple<Ts...>` 当容器 | 宏拼接 |
| 回调、延迟调用 | 模板参数（零开销） | `std::function` | 裸函数指针（要捕获时） |
| 类型擦除、稳定 ABI | `std::function` / 手写 vtable | 接口类 | 模板（每个实例化都要重新编译） |
| 防止同底层类型混用 | 强类型包装 | `enum class` | 命名约定 |

## 10 · 推荐阅读

| 资源 | 用来查什么 |
| --- | --- |
| cppreference：[Constraints and concepts](https://en.cppreference.com/w/cpp/language/constraints) | `requires` 的精确规则、约束包含、原子约束的定义 |
| cppreference：[SFINAE](https://en.cppreference.com/w/cpp/language/sfinae)、[fold expressions](https://en.cppreference.com/w/cpp/language/fold) | 替换失败的确切范围、空包折叠值 |
| cppreference：[partial specialization](https://en.cppreference.com/w/cpp/language/partial_specialization) | 偏特化的匹配与排序规则 |
| 标准草案 [eel.is/c++draft](https://eel.is/c++draft/) | 上面几页说法有冲突时，以 `[temp.constr]`、`[temp.deduct]` 为准 |
| [Compiler Explorer](https://godbolt.org/) | 看模板实例化后的汇编，确认“零成本”是否成立；也能对比不同编译器的报错 |
| [C++ Insights](https://cppinsights.io/) | 看 `auto`、范围 for、lambda、模板实参推导被展开成什么 |
| 《Effective Modern C++》（Meyers） | Item 1–3：模板/`auto`/`decltype` 的推导规则；Item 24–27：转发引用、`std::move`/`std::forward`、以及转发引用重载的替代方案（标签分派、`enable_if`） |
| 《C++ Templates: The Complete Guide》第 2 版 | traits、type list、CRTP、policy 等模式有专章；第 2 版覆盖到 C++17，Concepts 部分要看后续资料 |

---

回到路线起点：[C++ 模板元编程](/cpp-tmp/)。如果 Concepts 那节还有不清楚的地方，建议先重读 [06 · Concepts](/cpp-tmp/06-concepts) 的“约束包含”一节——它是所有重载选择问题的根源。
