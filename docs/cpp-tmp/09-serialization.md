---
title: 09 · 实战二：把结构体自动变成 JSON
description: 用成员指针与 tuple 描述字段，再用 std::apply 和折叠把同一份字段表同时用于序列化与反序列化
---

# 09 · 实战二：把结构体自动变成 JSON

> **一句话**：序列化代码之所以难维护，是因为“结构体有哪些字段”这件事被抄了三遍；把字段表做成一个可遍历的编译期对象，写一次就能同时驱动输出、输入和未来的数据库映射。

## 一个字段，四处修改

真实项目里的序列化代码通常长这样：

```cpp
struct Person {
    std::string name;
    int age;
    Address addr;
};

json to_json(const Person& p) {
    return {{"name", p.name}, {"age", p.age}, {"addr", to_json(p.addr)}};
}

Person from_json(const json& j) {
    return {j.at("name").get<std::string>(),
            j.at("age").get<int>(),
            from_json(j.at("addr"))};
}
```

加一个字段，要改结构体、改 `to_json`、改 `from_json`，再补一条测试。漏掉任何一处，症状都很隐蔽：反序列化把新字段留在默认值上，序列化悄悄少写一个键，或者两个函数里的顺序不一致导致 JSON 对不上。

问题的根源不是 JSON 库不好用，而是**“字段有哪些”这份信息没有单一的存放处**。C++ 没有标准反射，所以这份信息得自己写下来；但只要写下来一次，后面所有用到它的地方都可以由模板自动展开。

## 第一步：字段表

字段表的每一项是“名字 + 成员指针”：

```cpp
template <class T>
struct member {
    std::string_view name;
    T pointer;            // 成员指针，例如 &Person::age
};

struct Address { std::string city; std::string zip; };
struct Person  { std::string name; int age = 0; Address addr; };

constexpr auto describe(Address*) {
    return std::make_tuple(member{"city", &Address::city},
                           member{"zip",  &Address::zip});
}

constexpr auto describe(Person*) {
    return std::make_tuple(member{"name", &Person::name},
                           member{"age",  &Person::age},
                           member{"addr", &Person::addr});
}
```

几个设计决定：

- **参数写 `Person*` 而不是 `Person`。** 这样函数不需要被调用，甚至不需要对象存在，只靠类型就能找到它。C++ 的 tag 惯用法（`std::iterator_traits` 那类）都这么干。
- **返回 `std::tuple`，不返回 `std::vector`。** 字段数量必须进类型：后面要靠 `std::apply` 把它展开成定长参数包。`vector` 在编译期没有长度。
- **成员指针而不是偏移量。** `v.*(f.pointer)` 是类型安全的：写错类型的成员指针根本无法存进 `member`，编译器在 `describe` 定义处就会报错。
- **`describe` 放在类型所在的命名空间里。** 调用时不写 `namespace::describe`，让 ADL 去找。这是后面能做“嵌套类型自动递归”的关键。

这份表看起来是手写的样板代码，确实如此——它就是那“一次”。后面所有逻辑都只依赖它。

## 第二步：把字段表摊开

有了字段表，输出就只剩一个问题：怎么把 tuple 里的每一项变成一段代码。答案是 `std::apply` 加折叠表达式：

```cpp
template <class T>
void write_value(std::ostream& os, const T& v);   // 前置声明，见下一节

template <class T>
void write_members(std::ostream& os, const T& v) {
    constexpr auto fields = describe(static_cast<T*>(nullptr));
    os << '{';
    bool first = true;
    std::apply(
        [&](const auto&... f) {
            (((first ? (void)0 : (void)(os << ',')), first = false,
              os << '"' << f.name << "\":", write_value(os, v.*(f.pointer))), ...);
        },
        fields);
    os << '}';
}
```

这十几行里有四个编译期机制同时在起作用：

1. `describe(...)` 在编译期求值，`fields` 是 `constexpr` 的 tuple，`sizeof...(f)` 就是字段数。
2. `std::apply` 把 tuple 拆成参数包，每个 `f` 的静态类型是 `member<std::string Person::*>` 这种具体类型。
3. 折叠表达式 `(..., ...)` 生成“字段一、字段二、字段三”的线性代码，没有循环、没有容器。
4. `v.*(f.pointer)` 里的成员指针在每一项上类型都不同，编译器逐一检查。

`first` 这个运行时变量看着别扭，但它换来一件好事：不需要特判“最后一个字段”，也不用在编译期做下标算术。逗号的处理只有一处逻辑。

## 第三步：按类型分派

`write_value` 决定每个字段怎么输出。这里用 concept 把“有字段表”变成一个可判定的条件：

```cpp
template <class T>
concept described = requires { describe(static_cast<T*>(nullptr)); };

template <class T>
void write_value(std::ostream& os, const T& v) {
    if constexpr (described<T>) {
        write_members(os, v);                 // 嵌套结构体：递归
    } else if constexpr (std::same_as<T, std::string>) {
        write_string(os, v);
    } else if constexpr (std::same_as<T, bool>) {
        os << (v ? "true" : "false");
    } else if constexpr (std::is_arithmetic_v<T>) {
        os << v;
    } else {
        static_assert(sizeof(T) == 0,
                      "这个类型没有 describe()，不知道该序列化哪些字段");
    }
}
```

`described<T>` 是整个设计的枢纽：它把“这个类型有没有提供字段表”变成了一个布尔常量。于是 `Address` 自动走递归分支，`std::string` 走转义分支，`int` 走数字分支，而一个没有 `describe` 的自定义类型会在编译期被最后那条断言拦住，报错信息里带着类型名。

`if constexpr` 在这里不只是省代码：被丢弃的分支**不会实例化**。如果写成普通 `if`，`write_members` 对 `int` 也会被实例化，然后炸在 `describe(int*)` 上。

字符串要转义，这是“能跑”和“正确”的分界线：

```cpp
inline void write_string(std::ostream& os, std::string_view s) {
    os << '"';
    for (char c : s) {
        switch (c) {
        case '"':  os << "\\\""; break;
        case '\\': os << "\\\\"; break;
        case '\n': os << "\\n";  break;
        default:   os << c;
        }
    }
    os << '"';
}
```

生产环境还要处理 `\t`、`\r`、控制字符和 UTF-8 校验。这里保留最小集合，是因为本章的重点在模板结构；但省略必须被说出来，否则示例会让人低估工作量。

## 第四步：同一份表反过来用

反序列化最容易写歪：另起一套字段名、另一套顺序。既然字段表已经描述了“有哪些字段、类型是什么”，读取也应该用它。

先写一个极简的读取器（只够处理我们输出的这种扁平 JSON）：

```cpp
class Reader {
    std::string_view s_;
    std::size_t i_ = 0;
public:
    explicit Reader(std::string_view s) : s_(s) {}
    void skip_ws() { while (i_ < s_.size() && (s_[i_] == ' ' || s_[i_] == '\n' || s_[i_] == '\t')) ++i_; }
    bool eat(char c) { skip_ws(); if (i_ < s_.size() && s_[i_] == c) { ++i_; return true; } return false; }
    void expect(char c) { if (!eat(c)) throw std::runtime_error(std::string("expected '") + c + "'"); }
    void expect_word(std::string_view w) {
        if (s_.substr(i_, w.size()) != w) throw std::runtime_error("unexpected key");
        i_ += w.size();
    }
    std::string_view token() {
        skip_ws();
        std::size_t b = i_;
        while (i_ < s_.size() && s_[i_] != ',' && s_[i_] != '}' && s_[i_] != ' ' && s_[i_] != '\n') ++i_;
        return s_.substr(b, i_ - b);
    }
    std::string quoted() {
        skip_ws();
        if (i_ >= s_.size() || s_[i_] != '"') throw std::runtime_error("expected string");
        ++i_;
        std::string out;
        while (i_ < s_.size() && s_[i_] != '"') out.push_back(s_[i_++]);
        ++i_;
        return out;
    }
};
```

然后复用同一个 tuple：

```cpp
template <class T>
void read_value(Reader& r, T& out);

template <class T>
void read_members(Reader& r, T& out) {
    constexpr auto fields = describe(static_cast<T*>(nullptr));
    r.expect('{');
    std::apply(
        [&](const auto&... f) {
            ((r.expect('"'), r.expect_word(f.name), r.expect('"'), r.expect(':'),
              read_value(r, out.*(f.pointer)), r.eat(',')), ...);
        },
        fields);
    r.expect('}');
}
```

`read_value` 的形状和 `write_value` 一一对应，只是方向相反：`described<T>` 递归、`std::string` 读引号、布尔读 `true`/`false`、算术走 `std::from_chars`。

这两份代码加起来约一百二十行，跑通一个带嵌套结构的往返：

```cpp
Person p{"Ada", 36, {"London", "N1"}};
auto json = to_json(p);
// {"name":"Ada","age":36,"addr":{"city":"London","zip":"N1"}}

Person q = from_json<Person>(json);   // 字段逐项写回
```

而添加一个字段只需要在结构体和 `describe` 里各写一次，序列化、反序列化、嵌套处理全部自动跟上。

## 和真实库的差距

| 库 | 字段表从哪来 | 新增字段要改几处 | 代价 |
| --- | --- | --- | --- |
| 手写 `to_json` / `from_json` | 人手抄 | 三到四处 | 漂移风险最高，但零依赖、零魔法 |
| nlohmann/json 的 ADL 接口 | 仍是手写，只是换成自由函数 | 三处（结构体 + `to_json` + `from_json`） | 每加类型都要写模板，字段多时很啰嗦 |
| Boost.Describe / visit_struct | 宏列出字段名 | 一处 | 宏；字段名是字符串，重命名不会自动同步 |
| Boost.PFR / reflect-cpp | 聚合反射，自动探测字段数 | 零处 | 只支持聚合类型；依赖编译器的实现细节 |
| Protobuf / FlatBuffers | 从 `.proto` 等 IDL 生成 | 改 IDL 再生成 | 多一条构建链，换来跨语言契约 |

这张表里没有“更好”，只有“把成本放在哪”。宏方案把成本放在预处理；反射方案把成本放在编译器兼容性；IDL 方案把成本放在构建流程。我们这一章的手写 `describe` 属于第一行和第二行之间：字段表是手写的，但展开是自动的。

C++26 正在把反射（P2996）加入标准。如果它落地，“字段表”可以由编译器生成，`describe` 这一层手工代码就能消失。但在那之前——包括你读这篇文章时大多数生产环境——上面这五种方案仍然并存。

## 代价与边界

- **字段表会漂移。** 加了字段忘了写进 `describe`，编译器不会提醒你。缓解办法是给每个结构体配一条测试：序列化再反序列化，比较所有字段；或者用 `static_assert(sizeof(T) >= ...)` 之类的手段做粗检——但真正的保障还是测试。
- **`describe` 必须处处一致。** 它是普通的内联函数，不同翻译单元如果看到不同的定义（比如条件编译），就是 ODR 违规，行为未定义。把它放在结构体旁边，不要放进 `#ifdef`。
- **编译时间与字段数同向增长。** 每个字段会实例化 `read_value`/`write_value` 的一份，嵌套类型还会递归展开。几十个字段的结构体在大型项目里能明显拖慢编译。
- **顺序即协议。** 我们的反序列化要求 JSON 的键顺序与字段表一致。真实库会按名字查找，代价是运行时多一次字符串比较（或者建一张哈希表）。用顺序换简单，是这一章刻意做的取舍。
- **没有处理未知字段、缺失字段、类型不匹配的错误路径。** `nlohmann::json` 在这些地方有完整的异常和对 `null` 的语义；我们的读取器遇到就 `throw`。这是示例与库的差距，不是模板能弥补的部分。

## 人话总结

<div class="human-note">
<strong>如果只记住一件事：</strong>序列化不是“把字段挨个写一遍”，而是<strong>先声明一次“有哪些字段”，再让模板去遍历它</strong>。字段表用成员指针写成，类型安全由编译器保证；遍历用 <code>apply</code> 加折叠，代码由编译器展开。
</div>

## 常见误解

**误解一：这就算“C++ 反射”了。**

不算。反射是“编译器知道类型的结构”，我们做的是“把结构手工声明成数据，再用模板消费这份数据”。区别在于新增类型仍然要手写 `describe`，而真正的反射一行都不用写。叫它“半反射”或者“描述式序列化”更准确。

**误解二：字段表用宏生成更好，反正少写代码。**

宏省的是输入，不是理解成本。`BOOST_DESCRIBE_STRUCT(Person, (), (name, age, addr))` 看起来短，但字段名重复了一遍，重命名时编译器和 IDE 都不会帮你改；宏展开后的报错位置也会跑到宏定义里。手写 tuple 更长，但每一行都是普通 C++，报错指向你自己的代码。

**误解三：`std::apply` 有运行时开销。**

`apply` 只是把 tuple 拆成参数包，编译后没有任何容器和循环的痕迹：每个字段的读写都是一段直线代码。真正的成本在编译期（实例化数量）和二进制体积上。

**误解四：字段顺序无所谓，JSON 对象本来就是无序的。**

JSON 对象确实无序，但我们的读取器按顺序消费字符。顺序一旦写错，读到的就是错位的值或者解析错误。真实库按名字查找，正是为了摆脱这个约束；用顺序换来的简单，必须在接口文档里写清楚。

## 本章小结

- 字段表 = “名字 + 成员指针”的 tuple，由 ADL 找到的 `describe(T*)` 提供。
- `std::apply` 加折叠把字段表展开成直线代码；成员指针保证每个字段的读写类型正确。
- `described<T>` 这个 concept 把“有没有字段表”变成编译期布尔，配合 `if constexpr` 实现递归与分派。
- 同一份字段表能同时驱动序列化和反序列化，这是它相对手写函数的唯一实质收益。
- 真实库的分歧在于字段表从哪来：手写、宏、聚合反射、IDL 生成，各有各的成本。

## 练习

1. **加一个 `std::optional<std::string>` 字段。** 要求 `nullopt` 输出 `null`，读取 `null` 时还原为空。提示：`std::optional` 不是聚合，`write_value` 里要单独一个分支。
2. **去掉顺序依赖。** 把 `read_members` 改成按名字查找：先扫描 JSON 的键，再和字段表里的名字比较。比较次数是字段数的平方，先接受它，再想一个用哈希表降到线性的办法。
3. **给字段表加校验。** 写一个 `static_assert`：字段名不能重复、不能为空，且总数不超过 32。提示：在 `describe` 返回之后对 tuple 做一次编译期扫描。
4. **测量编译成本。** 把 `Person` 复制成 5 个、10 个、20 个字段的版本，用 `-ftime-trace` 看实例化耗时。结论要区分“字段数增加”和“类型嵌套加深”两种增长方式。

---

下一篇：[10 · 实战三：类型擦除](/cpp-tmp/10-type-erasure)
