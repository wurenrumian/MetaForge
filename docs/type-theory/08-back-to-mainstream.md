---
title: 08 · 回到日常语言
description: 用类型论的眼光重看 TypeScript、Rust、Haskell、C++ 和 Python，并给出一条能走下去的学习路线
---

# 08 · 回到日常语言

> **一句话**：主流语言的类型系统各自截取了类型论的一个片段；看清自己手里的语言截走了哪一块、丢掉了哪一块，比记住 Agda 的语法有用得多。

## 学完 Agda，回到工位之后

有一个很具体的失落感：在 Agda 里你能证明加法交换律、能让数组越界变成编译错误、能让“这个分支不可能发生”变成类型检查器的判断；然后回到 TypeScript，你连“这个数组非空”都得靠运行时 `if (arr.length === 0) throw`。

更让人不舒服的是反向的落差。写 Agda 的时候你时时刻刻被类型追着跑，写 `n + 0 ≡ n` 要和归纳假设搏斗十分钟；回到日常语言，那种“编译器帮你想清楚了”的感觉消失了，你甚至开始怀疑那两周是不是白学。

不是白学。这一章把 Agda 的视角带回五门正在用的语言，逐门说清三件事：它能表达什么、拦住哪类错误、拦不住什么。这些语言的类型系统不是“更弱的 Agda”，而是在不同位置做了不同的取舍。

## TypeScript：结构类型加联合类型

TypeScript 最值得从类型论角度看的，是两件事。

先说结构类型（structural typing）。`interface Point { x: number; y: number }` 不是一个需要显式实现的标签，任何恰好有 `x`、`y` 两个数字字段的对象都是 `Point`。这相当于“类型是值的性质集合”，和 Agda 里“类型是由构造子定义的”正好相反。好处是接口组合自由；代价是没有名义区分——`Point` 和 `Vector2` 只要形状一样就完全通用，你没法用类型表达“这两个虽然长得一样但不能混用”。

联合类型（union type）加字面量类型（literal type），则是 TypeScript 最接近 Agda 的地方：

```ts
type Result =
  | { kind: "ok"; value: number }
  | { kind: "err"; message: string };
```

这就是一个带标签的和类型，`kind` 就是 `inj₁` / `inj₂` 的标签。配合 `switch` 和 `never`，你能拿回穷尽性检查：

```ts
function handle(r: Result): string {
  switch (r.kind) {
    case "ok":  return String(r.value);
    case "err": return r.message;
    default: {
      const exhaustive: never = r;   // 漏掉分支时这里报错
      return exhaustive;
    }
  }
}
```

`never` 是底部类型，对应 Agda 的 `⊥`：没有值。`unknown` 是顶部类型，对应“任何值，但你必须先收窄才能用”。有了这两个端点，类型系统才谈得上完备——类型论里的“顶”和“底”，在语言里就是这样落地的。

它拦不住什么？长度、非空、有序、范围。`Vec A n` 这种“长度写在类型里”的东西，TypeScript 只能退而求其次：元组类型 `[T, T]` 能表达固定长度，但一旦长度是变量就没戏。`arr[0]` 的类型在默认配置下是 `T`，而它实际可能是 `undefined`——打开 `noUncheckedIndexedAccess` 后会诚实地变成 `T | undefined`，但那仍然不是证明，只是一句更谨慎的提醒。

另外要清楚它的不健全之处：`any` 会污染整条链路，`as` 断言可以骗过检查器，非空断言 `!` 直接关掉检查。这些是**渐进类型**（gradual typing）为了可用性付出的代价，不算 bug。

## Rust：把“谁负责释放”写进类型

Rust 的类型系统用类型论的手段解决资源问题：谁分配、谁释放、谁还能借用。

`enum` 就是和类型，`match` 强制穷尽：

```rust
enum Shape { Circle(f64), Rect(f64, f64) }

fn area(s: &Shape) -> f64 {
    match s {
        Shape::Circle(r) => 3.14159 * r * r,
        Shape::Rect(w, h) => w * h,
    }   // 少写一个分支就编译不过
}
```

`Option<T>` 和 `Result<T, E>` 把“可能没有”和“可能失败”从注释变成了类型，`unwrap()` 的丑陋正是它逼你面对这件事的方式。

生命周期（lifetime）标注是 Rust 独有的东西，也最容易被误会成“Agda 那种类型携带值”。不是。`&'a T` 里的 `'a` 描述的是**这个引用能活多久**，它是借用检查器的输入，不是值的属性。Agda 的 `Vec A n` 里那个 `n` 是一个真实的、可以被计算的数；Rust 的 `'a` 是一个区间约束，你没法对它做模式匹配，也没法证明关于它的定理。

最接近依赖类型的是 const generics：`[T; N]` 把长度放进了类型。但它只能做到“长度是常量”，做不到“长度大于零”：

```rust
fn first<T, const N: usize>(arr: [T; N]) -> &T {
    &arr[0]        // N 可能是 0，这里会 panic
}
```

要写 `N > 0` 这个前提，Rust 没有语法。同一件事写在 Agda 里是这样：

```agda
module Chapter08 where

data ℕ : Set where
  zero : ℕ
  suc  : ℕ → ℕ

data Vec (A : Set) : ℕ → Set where
  []  : Vec A zero
  _∷_ : {n : ℕ} → A → Vec A n → Vec A (suc n)

first : {A : Set} {n : ℕ} → Vec A (suc n) → A
first (x ∷ xs) = x
```

区别在于谁负责证明。Rust 的 `first` 必须自己处理 `N = 0`，不管是 panic 还是返回 `Option`；Agda 的 `first` 没有任何运行时检查，因为 `Vec A zero` 和 `Vec A (suc n)` 统一不了，空数组在类型层面就进不来。代价是 Agda 里长度会在每个签名上出现，而 Rust 里只有一个 `N`。

## Haskell：Agda 的直系亲属

Agda 的语法、`where` 子句、模式匹配、混合中缀写法，全部来自 Haskell。所以从 Haskell 看 Agda 是最顺的。

它的 ADT 和类型类（type class）分别是“和类型/积类型”和“特设多态”（ad-hoc polymorphism）。GADT 更进一步：

```haskell
data Expr a where
  Lit  :: Int -> Expr Int
  Bool :: Bool -> Expr Bool
  Add  :: Expr Int -> Expr Int -> Expr Int
```

`Lit` 的返回类型是 `Expr Int`，不是 `Expr a`。这让构造子的返回类型可以被收窄，写法和 Agda 的索引数据类型很像。再加上 `DataKinds` 和 type family，你确实能在类型层面做相当复杂的计算。

但 Haskell 和 Agda 之间有一条不可跨越的界线：**Haskell 不是一致的逻辑**。`undefined :: a` 对任何类型都成立，`unsafeCoerce` 可以随便转型，递归没有终止检查。所以 Curry–Howard 读法在 Haskell 里立刻失效——每个命题都有“证明”，只不过那个证明是 `undefined`。Haskell 是**编程语言**，Agda 是**证明助手**；它们共享语法，不共享承诺。

## C++：编译期计算的黑客传统

C++ 的类型系统是一路打补丁长出来的，但有几个点和类型论直接相关。

模板意外地图灵完备：模板实例化可以在编译期做循环、做递归、做条件分支，代价是错误信息和编译时间。`std::variant` 是标准库给的和类型，`std::optional` 是 `Maybe`，`std::visit` 要求你为每个备选提供可调用的处理——但只要你写一个泛型兜底 lambda，这个要求就退化成“什么都接受”，穷尽性又没了。

C++20 的 Concepts 是目前最接近“把约束写进类型”的特性：

```cpp
template <typename T>
  requires std::totally_ordered<T>
T clamp(T v, T lo, T hi);
```

`requires` 子句在重载决议时被检查，所以传一个不可比较的类型会得到一条能读的报错，而不是二十屏模板展开。这已经有点 refinement type 的味道了：不只是“T 是个类型”，而是“T 满足某个谓词”。但这些谓词只能是编译期可判定的概念，不能是“这个值大于零”。

C++ 的边界很清晰：类型系统不管别名（`restrict` 靠约定）、不管生命周期（`std::string_view` 悬垂是合法的）、不管越界（`operator[]` 不做检查）。它能拦住的，基本只有“形状不匹配”。

## Python：静态检查作为可选层

Python 的路线完全不同：注解在运行时几乎不起作用，类型检查交给外部工具（mypy、pyright）。

```python
from typing import Protocol, Literal, assert_never

class Reader(Protocol):
    def read(self) -> bytes: ...

Mode = Literal["strict", "lenient"]
```

`Protocol` 是结构类型（PEP 544），`Literal` 是字面量类型，`assert_never`（Python 3.11 起）能在 `match` 的兜底分支里做穷尽性检查——用法和 TypeScript 的 `never` 一模一样。

它的分工值得说清楚：**静态检查负责形状，运行时检查负责数据**。类型检查器能告诉你“这个函数要求 `bytes`，你传了 `str`”；它不能告诉你“这个 `bytes` 里是不是合法的 UTF-8”。后者必须靠运行时校验或测试。而且 `Any` 一旦进入，类型信息就像漏水的桶，上下游全部退化。

## 一张对照表

| 语言 | 类型能力 | 能提前排除的错误 | 仍然要靠测试的地方 |
| --- | --- | --- | --- |
| TypeScript | 结构类型、联合类型、字面量类型、`never`/`unknown` | 字段名拼错、分支漏处理（配合 `never`）、`null` 未收窄 | 长度、范围、非空、数据格式、`any` 逃逸后的整条链路 |
| Rust | 所有权、借用、生命周期、`enum`、trait、const generics | 悬垂引用、数据竞争、未处理 `None`/`Err`、`match` 漏分支 | 业务逻辑、数值范围、`N > 0` 这类前提、`unwrap` 的合理性 |
| Haskell | ADT、类型类、GADT、类型族 | 形状不匹配、漏模式（需开警告）、部分空值问题 | 终止性、`undefined` 与 `unsafeCoerce`、性能 |
| C++ | 模板、Concepts、`std::variant`/`optional` | 模板参数不满足约束、`variant` 访问错类型 | 越界、悬垂、别名、UB、逻辑错误 |
| Python | 渐进类型、`Protocol`、`Literal`、`assert_never` | 参数类型不匹配、属性不存在、部分漏分支 | 运行时数据校验、动态属性、`Any` 污染 |
| Agda（参照） | 依赖类型、索引数据类型、同一性类型 | 越界、长度不符、命题不成立、漏分支 | 规格本身的正确性、性能、人写错的需求 |

这张表最重要的一列是最后一列：类型能力越强，能证的东西越多，但“证对了什么”始终取决于你写下的规格。规格写错，再强的类型系统也只是把你的错误固化得更牢固。

## 主流语言正在吸收什么

过去二十年，类型论的想法确实在往工业界渗，只是渗得很慢，而且往往换了个名字：

- **细化类型（refinement type）**：类型加谓词，比如 `{v : Int | v > 0}`。Liquid Haskell 用它在 Haskell 上做可满足性检查；F* 是更完整的依赖类型加细化类型的语言。
- F\*：微软研究院出品，用它可以写出既被验证又能编译成 C 的代码。HACL\* 与 EverCrypt 的加密实现就是用 F\* 验证并生成 C 的，miTLS 也建立在它之上。
- Dafny：面向程序验证的语言，AWS 用它验证了 AWS Encryption SDK 的核心部分。
- Lean 4：既是证明助手也是编程语言，mathlib 是最大的形式化数学库之一；AWS 也用 Lean 形式化了 Cedar 授权语言的语义并证明了相关性质。
- Idris 2：依赖类型加量化类型理论（quantitative type theory），把线性/擦除信息也放进类型里。

这些项目有一个共同点：它们都用在“错了会很贵”的地方——密码学、编译器、授权策略。没有人在写 CRUD 的时候用 F*，因为成本不划算。

## 继续学习：三条路线

不要从头读一本类型论教材。按目标选路：

路线一：想把类型论本身弄明白。读 PLFA（*Programming Language Foundations in Agda*）。它免费在线，从自然数、归纳、等式一路讲到 lambda 演算和 bisimulation，全程用 Agda，而且每一章都能在浏览器里加载。读完 PLFA，你对本站后面没讲的部分（归约、进度与保型、道德等价）就有了底。之后可以读 TAPL（*Types and Programming Languages*）补上非依赖类型系统的全景。

路线二：想做程序验证。读 Software Foundations（Coq）。第一卷 *Logical Foundations* 讲的是同一套 Curry–Howard，只是换了个证明助手；第二、三卷开始讲程序语义和分离逻辑。做完之后你会对“验证一个真实程序”的工程量有概念，这是 Agda 给不了的。顺带一提，Coq 现在官方名为 Rocq，教程仍以旧名流传。

路线三：想用 Lean 4。先读 *Theorem Proving in Lean 4*，再做 *Mathematics in Lean*，然后直接进 mathlib 读别人的证明。Lean 4 的社区活跃、工具链（VS Code 插件、`lake`）成熟，是目前上手体验最好的证明助手。

如果你只是想让日常代码更安全一点，那这三条路线都可以先不选。更划算的做法是：把今天写的接口重新看一遍，找出那些“语义上是和、类型上是积”的地方，把它们换成联合类型或 `enum`。这一步不需要任何新工具，收益立刻可见。

<div class="human-note">
<strong>如果只记住一件事：</strong>类型系统的强弱是一组取舍，不是一条从坏到好的直线——表达力、可推断性、编译时间、错误信息的可读性，四者互相拉扯。Agda 把表达力拉到了极值，代价是你得自己写证明；TypeScript 把可推断性拉到很高，代价是它只能拦住形状错误。选语言就是选你愿意付哪份代价。
</div>

## 常见误解

**误解一：既然 Agda 更强，那它应该被用在生产里。**

Agda 的定位是显微镜，不是生产工具。它的终止检查要求你为每个递归函数证明会停机，这在写业务逻辑时是纯粹的负担；它的编译产物、标准库生态、工具链也都不是为工程准备的。**强类型不等于适合生产**，就像显微镜不适合当锤子用。

**误解二：Rust 的生命周期就是依赖类型。**

不是。生命周期描述的是引用的存活范围，它由借用检查器推断，你不能对它做模式匹配、不能对它归纳、也不能证明关于它的定理。依赖类型是“类型里出现可以被计算的值”，Rust 里最接近这个的是 const generics，而它也只能处理常量。

**误解三：TypeScript 的 `never` 和 Agda 的 `⊥` 完全一样。**

语义上确实都是空类型，但用法差得很远。`⊥` 在 Agda 里可以出现在任何类型位置，`⊥-elim` 让你从它推出任何命题；`never` 主要用于穷尽性检查和“永不返回”的函数返回类型。你不能拿 `never` 当证明用，因为 TypeScript 的类型层不允许你写归纳。

**误解四：类型检查通过就意味着不需要测试了。**

这张表最后一列已经回答了：类型覆盖的是你写下来的规格，测试覆盖的是你没想到的情况。而且越是依赖类型重的代码，规格写错的代价越大——你花三天证明了一个定理，第四天发现定理的前提写错了。

## 本章小结

- 结构类型（TS、Python `Protocol`）不要求提前声明，形状对上就能用，代价是没有名义区分；联合类型加 `never`/`assert_never` 是目前最实用的穷尽性检查手段。
- Rust 用类型系统管理资源（所有权、借用），而不是管理逻辑；生命周期是借用检查器的输入，不是可以被证明的对象。
- Haskell 与 Agda 共享语法，但 `undefined` 和 `unsafeCoerce` 让它不再是一致逻辑；GADT 是两者之间最像的桥梁。
- C++ 的模板是编译期计算，Concepts 把约束写进了重载决议；但它对越界、悬垂、别名一概不管。
- 依赖类型已经在密码学（F\*、HACL\*）、云服务（Dafny）和数学（Lean 4）落地，但都限定在“错了会很贵”的场景。

## 练习

1. 选一门你最熟的语言，写一个“它能表达、但 Agda 能表达得更精确”的例子。要求指出：这个类型现在漏掉了哪条约束？在 Agda 里你会把它写成什么签名？
2. 把一段 TypeScript 的 `switch` 加上 `never` 穷尽检查，然后故意删掉一个分支。记录报错信息，并和 Agda 漏掉一个模式匹配时的报错做对比——它们各自告诉了你什么、没告诉你什么。
3. C++ 的 `std::visit` 要求 visitor 对 `std::variant` 的每个备选都可调用，但只要写一个泛型兜底 lambda（`[](auto&&){ ... }`），这个要求就退化成“什么都接受”。写一个最小例子说明这个退化，然后解释：为什么 Agda 的 `⊎` 不会出现同样的问题？
4. Haskell 里 `undefined :: a` 让每个类型都有元素。用这个事实解释：为什么在 Haskell 里 Curry–Howard 读法会失效？这条漏洞和 Agda 的什么检查直接对应？

---

路线到此结束。回到 [类型论 × Agda](/type-theory/) 看学习地图，或者换一条线继续：[C++ 模板](/cpp-tmp/01-template-basics)、[C++ 生命周期](/lifetime/01-three-meanings)。
