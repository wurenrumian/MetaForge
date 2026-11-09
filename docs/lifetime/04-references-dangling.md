---
title: 04 · 引用与悬垂
description: 六种最常见的悬垂引用场景，逐一拆开并给出修复方式
---

# 04 · 引用与悬垂

> **一句话**：引用本身不拥有对象，它只是一张写着地址的便条；对象被销毁后，便条还在，地址还在，但那扇门后面已经不是原来的房间——这类错误在语法上完全合法，只能靠人盯着生命周期。

## 一个延迟引爆的 bug

```cpp
#include <functional>
#include <iostream>

std::function<void()> make_printer() {
    int value = 42;
    return [&value] { std::cout << value << '\n'; };
}

int main() {
    auto print = make_printer();
    print();     // 这是 UB，不要依赖实际输出
}
```

`make_printer` 返回时，`value` 的存储期结束；返回的 lambda 里存着 `value` 的引用。等 `main` 调用 `print()` 时，那次函数调用的栈帧早已弹掉。

这段代码最恶劣的地方在于：它可能真的打印出 42。栈帧弹出通常不清内存，那块字节碰巧还没被覆盖。于是你以为自己写对了，直到某天在 `print()` 前面多调用一个函数、或者打开 `-O2`，输出突然变成一串随机数。

悬垂（dangling）指的就是这种状态：**指针、引用、迭代器或视图仍然存在，但它指向的对象已经不存在。** 使用它就是未定义行为（UB）。

## 引用与指针：先分清它们的差别

```cpp
int x = 1;
int& r = x;        // 引用：x 的别名
int* p = &x;       // 指针：保存 x 的地址
```

| 维度 | 引用 `T&` | 指针 `T*` |
| --- | --- | --- |
| 是否必须初始化 | 必须 | 可以不初始化（但很危险） |
| 能否为空 | 合法引用总指向对象 | 可以 `nullptr` |
| 能否重新绑定 | 不能，初始化后永远指向同一个对象 | 可以改指向 |
| 能否做算术 | 不能 | 可以 |
| 是否拥有对象 | 不拥有 | 不拥有（除非约定它拥有） |
| 能否悬垂 | 能 | 能 |

最容易被忽略的是最后一行：很多人觉得“引用比指针安全”，因为引用不能为空、不能乱指。但引用同样会悬垂，而且因为它语法上不能判空，悬垂之后连“检查一下”的余地都没有。

还有一条：引用不拥有对象。`T&` 不会延长 `T` 的寿命，也不会在销毁时释放 `T`。它只是一张便条。

下面六种场景，是工程里绝大多数悬垂的来源。

## 场景一：返回局部变量的引用或指针

```cpp
int& bad_ref() {
    int x = 42;
    return x;          // x 在函数返回时销毁
}

int* bad_ptr() {
    int x = 42;
    return &x;         // 同上
}

std::string& bad_str() {
    std::string s = "forge with a fairly long name";
    return s;          // s 和它管理的缓冲区一起失效
}
```

三种写法后果一样，第三种更隐蔽：`std::string` 是一个对象，它还可能管着一块堆内存，返回时两者一起没。

修复方式按场景选：

```cpp
int good_value() { return 42; }                       // 1. 返回值

std::unique_ptr<int> good_heap() {                    // 2. 返回所有权
    return std::make_unique<int>(42);
}

void fill(int& out) { out = 42; }                     // 3. 调用者提供存储
```

原则是：**返回值（拷贝或移动），或者把存储的所有权/生命周期交给调用者。** 不要返回“指向自己栈帧的地址”。

## 场景二：返回成员引用，但对象本身被销毁

```cpp
struct Config {
    std::string path;
};

const std::string& default_path() {
    Config c{"data.txt"};
    return c.path;      // c 销毁，path 跟着销毁
}
```

`c.path` 这个引用本身没问题，问题是 `c` 不在了。成员引用的有效期永远受限于宿主对象。

更隐蔽的版本是“宿主对象由调用者负责”：

```cpp
const std::string& path_of(const Config& c) {
    return c.path;      // 安全，只要调用者让 c 活着
}
```

这个函数本身没有错，但它把责任推给了调用者。调用者如果写成下面这样就完了：

```cpp
const std::string& p = path_of(Config{"tmp.txt"});   // 悬垂
```

这里容易误判成“引用绑定临时对象，应该会被延长”。但标准规定：绑定到函数引用参数的临时对象，只活到包含这次调用的完整表达式结束，`return` 出来的引用不会替它续命。延长只在“引用直接绑定到临时对象”的那一刻发生，而这里绑定已经发生在参数上了。

修复思路只有一条：让被引用的对象活得比引用久。可以返回值、返回 `shared_ptr`，或者由调用方显式持有一个 `Config` 对象。

## 场景三：临时对象与生命周期延长

这是 C++ 里少数“看起来该悬垂、实际安全”的规则，也是被误解最多的一条。

```cpp
const std::string& s = std::string("hi");   // 安全：临时对象的寿命被延长到 s 结束
std::string_view sv = std::string("hi");    // 危险：sv 悬垂
```

### 延长规则到底怎么写的

当 `const T&`（或 `T&&`）直接绑定到一个临时对象时，那个临时对象的生命周期被延长到与该引用相同。注意三个限定词：

1. 必须是引用。`std::string_view` 是值类型，不是引用，它只保存指针和长度，构造完就和临时字符串没关系了。
2. 必须绑定到临时对象本身，而不是由它派生出的值。视图、指针、迭代器的构造不会触发延长——延长只发生在“引用直接绑定到临时对象”这一刻。
3. 函数返回值不延长。

```cpp
const std::string& bad() {
    return std::string("hi");   // 悬垂：return 语句不触发延长
}
```

`bad()` 返回后，临时字符串在完整表达式结束时就销毁了。

### string_view 的定位

`std::string_view` 的设计目标只有一个：做参数。

```cpp
void log(std::string_view msg);      // 好：调用者传 string、字面量都行，不拷贝

struct Entry {
    std::string_view name;           // 坏：Entry 活得比 name 指向的字符串久
};
```

作为参数，`string_view` 指向的字符串一定活到函数调用结束，安全且零拷贝。作为成员，它把“指向谁、谁负责让它活着”这个问题留给了结构体的使用者，而这个责任几乎总是被忘掉。成员该用 `std::string`（拥有）或明确记录生命周期约定。

## 场景四：range-for 中修改容器

```cpp
std::vector<int> v{1, 2, 3, 4};

for (int x : v) {
    if (x == 2) v.push_back(5);   // 扩容可能重新分配，迭代器全部失效
}
```

range-for 在底层持有一对迭代器（`begin` / `end`）。`push_back` 触发扩容时，元素被搬到新内存，旧内存释放，那对迭代器指向的地方已经不存在了。继续用它，就是 UB。

正确写法有三种：

```cpp
// 1. 先收集，再修改
std::vector<int> to_add;
for (int x : v) if (x == 2) to_add.push_back(5);
v.insert(v.end(), to_add.begin(), to_add.end());

// 2. 用下标，每次重新读 v.size()
for (std::size_t i = 0; i < v.size(); ++i) {
    if (v[i] == 2) v.push_back(5);
}

// 3. 预留足够容量，让本次不扩容（前提是你能算准）
v.reserve(v.size() * 2);
```

删除元素时还有另一种写法上的陷阱：

```cpp
for (auto it = v.begin(); it != v.end(); ) {
    if (*it % 2 == 0) it = v.erase(it);   // erase 返回下一个有效位置
    else ++it;
}
```

`erase` 会让被删位置及其后的迭代器失效，所以必须用它的返回值继续，不能 `++it`。

顺带说清 `auto` 与 `auto&`：

```cpp
for (auto x : v) x *= 2;          // 改的是副本，v 不变
for (auto& x : v) x *= 2;         // 改的是元素本身
for (const auto& x : v) { }       // 只读，且不拷贝
```

`auto` 拷贝一份，`auto&` 绑定到元素。后者少一次拷贝，但也意味着你手里的东西是“引用”——容器一变，它就悬垂，和前面所有场景的规则完全一致。

容器失效的完整规则（`vector`、`deque`、`map`、`list` 各不相同）在第 05 篇展开。

## 场景五：lambda 捕获

```cpp
std::function<void()> f;
{
    int x = 1;
    f = [&x] { std::cout << x; };
}                 // x 销毁
f();              // 悬垂
```

`[&x]` 捕获的是 `x` 的引用，lambda 对象里存的是一个指针。`x` 一销毁，这个指针就悬垂了。`[&]` 更危险，因为它会把用到的所有局部变量都按引用捕获，而你通常记不住一共捕获了哪些。

修复按“这个值要不要和 lambda 一起活”来选：

```cpp
f = [x] { std::cout << x; };                       // 1. 按值捕获（拷贝一份）

auto p = std::make_shared<int>(1);                 // 2. 共享所有权
f = [p] { std::cout << *p; };

f = [x = std::move(big_object)] { use(x); };       // 3. 初始化捕获（C++14）
                                                   //    假设 big_object 已在别处定义
```

按值捕获不是万能的：如果捕获的东西本身是 `int*`、`std::string_view` 或 `std::reference_wrapper`，你只是把“悬垂的指针”复制了一份。**值捕获保证的是“这个句柄活着”，不是“句柄指向的东西活着”。**

## 场景六：异步回调捕获 `this`

```cpp
class Session {
public:
    void start() {
        timer_.async_wait([this](auto) { on_timeout(); });
    }
private:
    void on_timeout();
    Timer timer_;      // 示意：Timer 代表任意异步定时器
};
```

回调注册时 `Session` 还活着，回调执行时它可能已经被销毁。`[this]` 捕获的是裸指针，生命周期没有任何保证。

标准解法是 `std::enable_shared_from_this` 加 `std::weak_ptr`：

```cpp
class Session : public std::enable_shared_from_this<Session> {
public:
    void start() {
        std::weak_ptr<Session> weak = weak_from_this();
        timer_.async_wait([weak](auto) {
            if (auto self = weak.lock()) {
                self->on_timeout();     // 在这一行期间，对象保证活着
            }
        });
    }
private:
    void on_timeout();
    Timer timer_;
};
```

两个前提必须说清楚：

- 对象必须由 `std::shared_ptr` 管理。如果 `Session` 建在栈上，`weak_from_this()` 返回空，回调永远不会执行。
- `lock()` 之后要立刻用，不要长期持有 `self`，否则等于延长了对象寿命，可能造成“该销毁的没销毁”。

如果不能用 `shared_ptr`，另一种做法是显式的生命周期令牌（token）：回调持有一个 `weak_ptr<Token>`，对象销毁时令牌失效，回调检查令牌再决定是否执行。

## 其他语言怎么防这件事

- Rust：引用带生命周期标注，借用检查器（borrow checker）在编译期拒绝“引用比所有者活得久”。想把字符串的视图存进结构体，就得写 `struct Entry<'a> { name: &'a str }`，编译器会逼你说清 `'a` 从哪来、活多久。
- Python：所有对象都在堆上，变量只是名字绑定，引用计数保证对象活到最后一个引用消失。你几乎不会遇到悬垂，但会遇到另一种问题：闭包捕获了可变对象，之后被别处改掉。
- Java：只有对象引用，没有“指向局部变量的引用”，GC 保证可达对象不被回收。代价是无法控制回收时机，也无法用一个类型表达“我只是借用”。

## 工程上怎么把这类 bug 压下去

- 打开警告并当真。`-Wall -Wextra` 之外，GCC 13 起有 `-Wdangling-reference`；GCC 的 `-Wreturn-local-addr`、Clang 的 `-Wreturn-stack-address` 和 MSVC 的 C4172 几乎正好对应场景一。
- 让工具跑起来。AddressSanitizer（`-fsanitize=address`）能抓到堆上的 use-after-free 和一部分栈上的悬垂；libstdc++ 的 `-D_GLIBCXX_ASSERTIONS` 能让失效迭代器的访问尽早断言。
- 在接口上表达所有权。返回值类型说明“我交出所有权”，`const T&` 和 `std::string_view` 说明“我只在这次调用里借用”，成员里的 `std::string` 说明“我拥有它”。类型写对了，review 时就不需要猜。

## 症状、原因与修复对照

| 症状 | 可能原因 | 修复 |
| --- | --- | --- |
| 返回值偶尔正确、偶尔乱码 | 返回了局部变量的引用/指针 | 返回值或所有权 |
| 只在 `-O2` 下出错 | UB 被优化放大 | 同上，先消除 UB |
| 第二次调用后才崩 | 栈帧被复用，旧地址被覆盖 | 检查所有返回地址的函数 |
| `push_back` 之后数据错乱 | 迭代器/引用因扩容失效 | 用下标或先收集再改 |
| 回调执行时崩溃 | lambda 捕获了已销毁的局部变量或 `this` | 按值捕获 / `weak_ptr` |
| 字符串内容变成垃圾 | `string_view` 指向的临时对象已销毁 | 用 `std::string` 拥有数据 |

## 人话总结

<div class="human-note">
<strong>如果只记住一件事：</strong>引用、指针、迭代器、<code>string_view</code> 都是“借来的”，借条不会让房子多活一天。每次你把它们存起来、返回出去、交给回调，都要问一句：<em>等我用它的时候，房东还在吗？</em>
</div>

## 常见误解

**误解一：引用比指针安全，不会悬垂。**

引用只是语法上更严格（必须初始化、不能重新绑定），它悬垂起来和指针一样致命，而且因为不能判空，连防御性检查都写不了。

**误解二：`const&` 绑定临时对象总是安全的。**

只在“直接绑定、且不跨越函数返回”的情况下安全。`return std::string("hi");` 这种返回引用的写法不会延长任何东西。

**误解三：`string_view` 是“更轻的 string”，可以随便存。**

它轻，正是因为它不拥有数据。做参数是它的主场，做成员、做返回值、做异步回调的捕获，都需要你自己保证源数据还活着。

**误解四：lambda 按值捕获就一定安全。**

按值捕获只保证句柄本身被复制。如果句柄是 `int*`、`string_view`、`reference_wrapper`，被指向的对象照样可以先死。

## 本章小结

- 引用不拥有对象，也不延长对象的寿命；它会悬垂，而且无法判空检查。
- 返回局部变量的引用或指针是 UB；应返回值、返回所有权，或让调用者提供存储。
- 成员引用的有效期受限于宿主对象，宿主销毁，引用立刻失效。
- `const&` 直接绑定临时对象会延长寿命；`string_view` 不是引用，不享受这条规则。
- 容器修改会让迭代器和引用失效；lambda 捕获与异步回调要把生命周期显式表达出来。

## 练习

1. 找出下面三段代码的悬垂点，并各给一个修法：

   ```cpp
   // (a)
   const std::string& label() { return std::string("tmp"); }

   // (b)
   std::string_view pick(const std::vector<std::string>& v) {
       return v.empty() ? std::string_view{} : v.front();
   }
   // 调用：auto sv = pick({"a", "b"});

   // (c)
   struct Entry { std::string_view name; };
   Entry make_entry(const std::string& s) { return {s}; }
   auto e = make_entry(std::string("tmp"));   // e.name 指向已销毁的临时对象
   ```

2. 解释为什么 `std::string_view` 适合做函数参数、不适合做类成员。各写一个 5 行以内的例子。

3. 下面这个循环为什么可能崩溃？改成安全写法，并说明 `auto` 和 `auto&` 在这里的差别：

   ```cpp
   std::vector<int> v{1, 2, 3};
   for (auto& x : v) {
       if (x == 1) v.push_back(4);
       std::cout << x;
   }
   ```

4. 把场景五里的 `[&x]` 改成安全版本，要求：即使 lambda 在 `x` 的作用域结束后才执行，也能打印出正确的值，并且不引入堆分配。

---

下一篇：[05 · 容器与迭代器失效](/lifetime/05-containers-iterators)
