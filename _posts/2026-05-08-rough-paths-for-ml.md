---
layout: post
title: "Rough Path Theory for Machine Learning: From Iterated Integrals to Neural CDEs"
date: 2026-05-08
description: A short introduction to rough path theory.
tags: [rough-paths, signatures, machine-learning, deep-learning, time-series]
math: true
---

> *Why do we keep rediscovering the same trick whenever we want to feed a continuous-time
> signal into a neural network? Because rough path theory got there first.*

If you have ever tried to do machine learning on a multivariate time series, you have
probably hit a frustrating wall. RNNs are slow and forgetful. Transformers want a fixed
grid. CNNs assume regular sampling. None of these architectures cleanly handle the
fundamental fact about a time series: it is a *path*, a continuous-time object that
happens to be observed at finitely many points.

Rough path theory is the corner of mathematics that takes paths seriously. It was built
by Terry Lyons in the 1990s [^lyons1998] to make sense of differential equations driven
by very irregular signals — Brownian motion, semimartingales, and worse. Along the way
it produced an extraordinary object called the **path signature**, which over the last
decade has quietly become one of the most powerful feature representations for sequential
data in machine learning.

This post is a working researcher's introduction to the parts of rough path theory that
matter for ML, what the signature is good for, where it has shown up in modern deep
learning, and what it lets you do that nothing else can.

---

## 1. The motivating problem: integrating against a rough signal

Suppose you want to model a controlled differential equation

$$
dy_t = f(y_t)\, dx_t,\qquad y_0 = y^\ast,
$$

where $x: [0,T] \to \mathbb{R}^d$ is a driving signal and $y: [0,T] \to \mathbb{R}^e$
is the response. If $x$ is smooth, the integral $\int f(y_s)\, dx_s$ is well-defined by
Riemann–Stieltjes. If $x$ is Brownian motion, you need Itô or Stratonovich calculus, and
your integral becomes random.

What if $x$ is something even rougher — a Hölder-continuous signal of exponent $\alpha < 1/2$?
Classical analysis breaks. The increments are too wild for the integral to make sense
pathwise.

Lyons's insight [^lyons1998][^lyons2007] was to ask: *what extra information do we need
to attach to* $x$ *to recover a sensible integration theory?* The answer, perhaps
surprisingly, is the **iterated integrals** of $x$ against itself:

$$
\int_0^T dx_{t_1},\quad \int_{0<t_1<t_2<T} dx_{t_1}\otimes dx_{t_2},\quad
\int_{0<t_1<t_2<t_3<T} dx_{t_1}\otimes dx_{t_2}\otimes dx_{t_3},\quad\dots
$$

The collection of *all* such iterated integrals, packaged together, is the signature.

The miracle is that once you specify these iterated integrals (the so-called "rough path
lift" of $x$), you can solve controlled differential equations against $x$ even when $x$
is much rougher than Brownian motion. And the solution map becomes *continuous* in the
rough path topology — the kind of regularity that makes numerical analysis possible.

For ML this matters because the messy real-world time series we want to model — neural
spike trains, financial tick data, climate observations — *are* rough. The signature
gives us a coordinate system in which they look smooth.

---

## 2. The path signature, defined carefully

Let $x: [0,T] \to \mathbb{R}^d$ be a continuous path of bounded variation (think
piecewise-linear interpolation of any time series). Its **step-$k$ signature** is the
$k$-th order tensor

$$
S_k(x) \;=\; \int_{0 \le t_1 < t_2 < \dots < t_k \le T}
dx_{t_1} \otimes dx_{t_2} \otimes \dots \otimes dx_{t_k}
\;\in\; (\mathbb{R}^d)^{\otimes k}.
$$

The **signature** of $x$ is the formal series

$$
S(x) \;=\; (1,\, S_1(x),\, S_2(x),\, S_3(x),\, \dots)
\;\in\; T((\mathbb{R}^d)) \;=\; \prod_{k=0}^\infty (\mathbb{R}^d)^{\otimes k}.
$$

For computation we always **truncate** at some level $n$:

$$
S^{\le n}(x) \;=\; (1, S_1(x), \dots, S_n(x)) \;\in\; T^{(n)}(\mathbb{R}^d).
$$

At step $k$, the tensor $S_k(x)$ has $d^k$ scalar coordinates, indexed by all length-$k$
words over $\{1,\dots,d\}$. The coordinate corresponding to word $(i_1, \dots, i_k)$ is

$$
S^{i_1, \dots, i_k}(x) \;=\; \int_{0 \le t_1 < \dots < t_k \le T}
dx^{i_1}_{t_1} \, dx^{i_2}_{t_2} \,\cdots\, dx^{i_k}_{t_k}.
$$

So the step-$2$ signature of a 3-channel path has $9$ coordinates, the step-$3$ has $27$,
and so on. Truncated to step $n$, the total dimension is $\sum_{k=0}^n d^k$.

### What does the signature *look like* on simple paths?

Three concrete examples build intuition:

**Linear path.** Let $x_t = v\, t$ for some $v \in \mathbb{R}^d$. Then
$S^i = v^i T$ and $S^{i,j} = v^i v^j T^2 / 2$, and in general
$S^{i_1,\dots,i_k} = v^{i_1}\cdots v^{i_k} T^k / k!$. The signature is just the
exponential tensor $\exp(vT)$.

**Concatenation of two paths.** This is the celebrated **Chen identity** [^chen1957]. If
$x|_{[a,b]}$ is followed by $x|_{[b,c]}$, then

$$
S(x|_{[a,c]}) \;=\; S(x|_{[a,b]}) \otimes S(x|_{[b,c]}),
$$

where $\otimes$ is the truncated tensor product. This is the algebraic backbone of
*everything* in rough paths. It says signatures over adjacent intervals compose
multiplicatively, just like exponentials of independent commuting scalars but in a fully
non-commutative setting.

**Reparameterization.** If you reparameterize time, the signature does not change at all.
The signature is invariant under any monotone reparameterization of $[0,T]$. This is
both a feature and an annoyance: it means signatures encode the *shape* of the path, not
its speed. We will fix this below by adding a time channel.

### Three structural facts that drive everything

1. **The signature lives in a Lie group.** The image of the signature map sits inside the
   set of *group-like* elements of the truncated tensor algebra, the **free nilpotent Lie
   group of step $n$**, written $G^n(\mathbb{R}^d)$ [^reutenauer1993][^friz2010]. Group-like
   means $\Delta(S) = S \otimes S$ where $\Delta$ is the comultiplication on the tensor
   algebra. Equivalently, signatures satisfy the **shuffle relations**: products of
   signature components in the tensor algebra equal "shuffled sums" of higher components.

2. **The log-signature lives in a Lie algebra.** Apply the formal logarithm:
   $\mathrm{LogSig}^{\le n}(x) = \log S^{\le n}(x)$. The result lives in the **free
   nilpotent Lie algebra** $\mathfrak{g}^n(\mathbb{R}^d)$, a *vector subspace* of the
   truncated tensor algebra spanned by Lie words. The log-signature has the **same
   information** as the signature but eliminates redundancies imposed by the shuffle
   relations.

3. **Factorial decay (Lyons's estimate).** The norm of the step-$k$ signature is bounded
   by

   $$
   \|S_k(x)\| \;\le\; \frac{\omega^{k/p}}{\Gamma(k/p + 1)},
   $$

   where $\omega$ is the $p$-variation control of $x$ [^friz2010]. For $p=1$ (bounded
   variation) this is a rapid factorial decay. This is what makes truncation work: most
   of the information lives in the first few levels.

### The Witt formula: how big is the log-signature?

The dimension of the free nilpotent Lie algebra $\mathfrak{g}^n(\mathbb{R}^d)$ is given
by the Witt formula:

$$
\dim \mathfrak{g}^n(\mathbb{R}^d)
\;=\;
\sum_{k=1}^n \frac{1}{k}\sum_{j \mid k} \mu(j)\, d^{k/j},
$$

where $\mu$ is the Möbius function. Some concrete numbers:

| $d$ | $n=2$ | $n=3$ | $n=4$ | $n=5$ |
|-----|-------|-------|-------|-------|
| 2   | 3     | 5     | 8     | 14    |
| 3   | 6     | 14    | 32    | 80    |
| 5   | 15    | 55    | 195   | 819   |
| 10  | 55    | 385   | 2860  | 25164 |

The log-signature is *much* smaller than the full signature ($d + d^2 + \dots + d^n$ for
$d=10, n=4$ is $11{,}110$ versus log-sig dimension $2860$). When you do learning, you
work in log-signature coordinates almost always.

### Time augmentation: making signatures faithful

The reparameterization invariance means the signature loses information about *when*
events happen. The standard fix is to augment the path with a time channel:

$$
x^{\text{aug}}_t \;=\; (t, x_t) \;\in\; \mathbb{R}^{d+1}.
$$

Hambly–Lyons [^hambly2010] proved that the signature uniquely determines the path *up to
tree-like equivalence*; with the time augmentation, this equivalence collapses and the
signature is essentially injective. Almost every signature-based learning paper adds this
augmentation.

---

## 3. Why machine learners care

There are five reasons signatures keep showing up in modern ML.

### 3.1 They are universal nonlinear features

The **universal nonlinearity property** [^chevyrev2016] says: any continuous function on
the space of paths can be approximated arbitrarily well by *linear* functionals of the
signature. In symbols, for any continuous $f: \text{Paths} \to \mathbb{R}$ and any
$\varepsilon > 0$, there exists a linear functional $\ell$ such that

$$
\sup_x |f(x) - \langle \ell, S(x)\rangle| < \varepsilon.
$$

This is the analog of the Stone–Weierstrass theorem for paths. It justifies a
shockingly simple recipe:

1. Compute the truncated signature of every input path.
2. Train *any* downstream linear or shallow model on those features.

You get a universal approximator without an RNN, without backprop through time, without
any temporal architecture at all. The "depth" lives in the signature transform itself.

### 3.2 They handle irregular sampling natively

Most time-series models assume a regular grid. Healthcare data does not. Ad-tech data
does not. Climate data, even, often does not. Signatures do not care: you can compute
$S(x)$ over any set of timestamps because you piecewise-linearly interpolate first and
*then* take iterated integrals. Two different sampling grids of the same underlying path
yield very nearly the same signature (the difference is bounded by the quadrature error
on the iterated integrals).

This is why signature methods dominate the irregular time-series benchmarks: they are
mathematically the right answer.

### 3.3 They give continuous-time learning

The signature is a continuous-time object. If you build your model around it, you get
continuous-time inference for free. Neural Controlled Differential Equations
[^kidger2020], the spiritual successor to Neural ODEs for time series, *are* this idea
made into a deep architecture: integrate a CDE driven by the path signature.

### 3.4 They give a kernel

The signature kernel $k(x, y) = \langle S(x), S(y)\rangle$ on the truncated tensor
algebra is a positive-definite kernel on path space. Salvi et al. [^salvi2021] showed it
is the solution of a Goursat PDE that can be evaluated in $O(L^2)$ time by finite
differences without ever instantiating the signatures. This makes signature kernels
practical even at $n=\infty$ — you can do kernel ridge regression, MMD-based generative
modeling [^issa2024], and Gaussian processes directly on paths.

### 3.5 They compress dramatically without losing what matters

Empirically: you take a length-$L$, $d$-channel time series, you compute its step-$4$
log-signature, and you get a vector of dimension $\dim \mathfrak{g}^4(\mathbb{R}^{d+1})$
that is essentially independent of $L$. For $d = 5$, $L = 1000$, this is a
$\approx 200$-dimensional vector that captures essentially everything a step-$4$
truncation can capture about the *shape* of the path. That is a $25\times$ compression
with provable error guarantees.

---

## 4. Where signatures show up in modern deep learning

### 4.1 Deep Signature Transforms (Kidger & Lyons, 2019)

Kidger and Lyons [^kidger2019] introduced the **signature layer** as a differentiable
module: input a batch of paths, output their truncated log-signatures. Stacked with
linear and nonlinear layers, this gives a deep architecture in which the signature does
the heavy lifting of temporal feature extraction, and the rest of the network does the
task-specific projection. They demonstrated competitive performance on character
recognition and other sequence tasks with far fewer parameters than RNNs.

### 4.2 Neural Controlled Differential Equations (Kidger et al., 2020)

Neural CDEs [^kidger2020] solve

$$
y_t \;=\; y_0 + \int_0^t f_\theta(y_s)\, dx_s,
$$

where $x$ is the (interpolated) input time series and $f_\theta$ is a neural network.
The output $y_T$ is the model prediction. NCDEs handle irregular sampling perfectly,
extrapolate cleanly in continuous time, and are the *correct* generalization of RNNs to
irregular streams. Their cousin, the **Neural Rough Differential Equation**
[^morrill2021], replaces $dx_s$ with the signature increment, allowing larger time steps
and faster training on long sequences.

### 4.3 Log neural CDEs and SLiCEs

More recent work on **Log NCDEs** [^walker2024] shows that retaining the Lie bracket
structure (rather than just first-order increments) gives strictly more expressive
continuous-time models. The **SLiCE** family [^walker2025] then combines structured
linear continuous-time equations with signature-based controls to reach state-of-the-art
on a range of long-sequence benchmarks.

### 4.4 Rough Transformers

Arroyo, Salvi, et al. [^arroyo2024] introduced **Rough Transformers**, which compute
local signatures over chunks of a long sequence and feed them as tokens to a standard
attention stack. The result is a transformer that handles irregular streams natively
*and* achieves linear cost in sequence length, because each chunk is summarized into a
fixed-size signature regardless of how many raw samples it contains. This is one of the
most practical demonstrations that signatures can replace positional encoding plus
patch-embedding plus dense attention with one principled object.

### 4.5 Signature kernels and MMDs

The signature kernel [^salvi2021] enables non-adversarial training of Neural SDEs via
signature MMD [^issa2024]: you treat your generator and target as distributions over
paths, compute their signature MMD distance via the Goursat PDE solver, and minimize.
This avoids GAN instabilities and gives a principled distributional metric on paths. It
underlies several recent state-of-the-art generative models for stochastic processes.

### 4.6 Generative models of time series

The most recent application is generation: **SigDiffusions** [^barancikova2025] runs a
score-based diffusion *in log-signature space*, with a closed-form Fourier inversion
that recovers the original time series from a generated log-signature. (I have written
[a separate post on this](02_sigdiffusions_explained.md) — it deserves its own
treatment.) The promise is real: signature-space diffusion sidesteps the long-sequence
issues of pixel-style diffusion on time series.

---

## 5. A concrete recipe: signatures in practice

Suppose you have a time-series classification problem. Here is the simplest signature
pipeline you can run:

```python
import numpy as np
import iisignature  # pip install iisignature
from sklearn.linear_model import LogisticRegression

# X: list of arrays, each shape (T_i, d). Variable T_i is fine.
# y: array of class labels.

def time_augment(path):
    T = len(path)
    t = np.linspace(0, 1, T).reshape(-1, 1)
    return np.concatenate([t, path], axis=1)

depth = 4
features = np.stack([
    iisignature.logsig(time_augment(x), depth)
    for x in X
])

clf = LogisticRegression().fit(features, y)
```

That is it. No RNN, no transformer, no padding, no backprop through time. On many
irregular-sequence benchmarks this beats deep models with three orders of magnitude more
parameters [^chevyrev2016].

For regression on paths, replace `LogisticRegression` with a small MLP. For generation,
you train a generative model on the signature features and invert (more on this in the
SigDiffusions post). For continuous-time prediction, you feed the signature into a
Neural CDE.

The signature is a *layer*, not a method. It composes.

---

## 6. The catches

I have made signatures sound magical. They are not. The catches:

**Truncation depth.** You always work with $S^{\le n}$ for some $n$. Choosing $n$ is a
hyperparameter — too small and you lose information, too large and dimension blows up.
Lyons's factorial bound gives theoretical guidance but practical choice is empirical;
$n \in \{3, 4, 5\}$ covers most cases.

**Channel dimension blowup.** $\dim \mathfrak{g}^n(\mathbb{R}^d)$ grows polynomially in
$d$ for fixed $n$, but the polynomial degree is $n$. For very high-dimensional time
series ($d > 50$) the log-signature becomes huge. Randomized signatures
[^cuchiero2021] sidestep this with a random projection trick.

**Signatures are not injective on the path itself.** They identify paths only up to
tree-like equivalence. Time augmentation fixes this in practice but the underlying issue
matters when you want *exact* path reconstruction from a signature. This is what the
Barančíková–Salvi closed-form Fourier inversion solves for a specific augmentation
[^barancikova2025].

**Computing the log is nontrivial.** Going from signature to log-signature involves the
formal series $\log(1+u)$ truncated at degree $n$ on the nilpotent algebra. Libraries
like `iisignature` and `signatory` handle this cleanly, but if you implement it yourself
you need to fix a Hall–Lyndon basis [^reutenauer1993] and be careful with conventions.

**Inversion (signature → path) is hard in general.** Given a signature, recovering an
underlying path is a nontrivial inverse problem. Approximate methods exist (the
Lyons–Xu inversion, the Chang–Lyons–Ni method) but in general you want to design your
problem so you do not need to invert. SigDiffusions's closed-form Fourier inversion is
the cleanest workaround in the generative setting.

---

## 7. Where rough paths are going

Three frontiers I find exciting:

1. **Generative modeling.** SigDiffusions [^barancikova2025] is the start. Combining
   rough path representations with flow matching, stochastic interpolants, and
   Riemannian generative models is a wide-open area.

2. **Foundation models for time series.** A signature-based encoder is variable-length,
   irregular-sample-tolerant, and continuous-time. These are exactly the properties a
   foundation model for time series wants. Rough Transformers [^arroyo2024] are an early
   sketch of what this might look like.

3. **Causal and dynamical inference.** The signature kernel as an MMD on paths gives a
   principled way to compare distributions over trajectories. This is the right tool
   for hypothesis testing, two-sample testing on dynamical systems, and identifying
   causal structure in continuous-time systems.

Rough path theory has spent thirty years quietly developing the right mathematical
framework for sequential data. The ML community has spent the last seven years catching
on. I think we are still at the beginning.

---

## 8. Further reading

If you want to go deeper:

- **For the math:** Friz & Victoir, *Multidimensional Stochastic Processes as Rough
  Paths* [^friz2010] is the canonical reference. Reutenauer, *Free Lie Algebras*
  [^reutenauer1993] is essential for the Hall–Lyndon coordinates.
- **For the ML view:** Chevyrev & Kormilitzin, *A Primer on the Signature Method in
  Machine Learning* [^chevyrev2016] is the gentlest entry point. Fermanian et al., *New
  Directions in the Applications of Rough Path Theory* [^fermanian2023] surveys the
  recent landscape.
- **For code:** the [`iisignature`](https://github.com/bottler/iisignature) library
  (CPU, NumPy/PyTorch friendly) and [`signatory`](https://github.com/patrick-kidger/signatory)
  (PyTorch-native, GPU) are the standard tools.
- **For inspiration:** the Imperial College and Oxford rough-path-meets-ML groups
  publish almost everything new in this area.

The signature is a quiet superpower. Pick it up.

---

## References

[^lyons1998]: T. Lyons. *Differential equations driven by rough signals.* Revista
    Matemática Iberoamericana, 14(2):215–310, 1998.

[^lyons2007]: T. Lyons, M. Caruana, T. Lévy. *Differential Equations Driven by Rough
    Paths.* Springer, 2007.

[^chen1957]: K.-T. Chen. *Integration of paths, geometric invariants and a generalized
    Baker–Hausdorff formula.* Annals of Mathematics, 65(1):163–178, 1957.

[^reutenauer1993]: C. Reutenauer. *Free Lie Algebras.* Oxford University Press, 1993.

[^friz2010]: P. Friz, N. Victoir. *Multidimensional Stochastic Processes as Rough
    Paths.* Cambridge University Press, 2010.

[^hambly2010]: B. Hambly, T. Lyons. *Uniqueness for the signature of a path of bounded
    variation and the reduced path group.* Annals of Mathematics, 171(1):109–167, 2010.

[^chevyrev2016]: I. Chevyrev, A. Kormilitzin. *A primer on the signature method in
    machine learning.* arXiv:1603.03788, 2016.

[^fermanian2023]: A. Fermanian, T. Lyons, J. Morrill, C. Salvi. *New directions in the
    applications of rough path theory.* IEEE BITS, 2023.

[^kidger2019]: P. Kidger, T. Lyons. *Deep signature transforms.* NeurIPS, 2019.

[^kidger2020]: P. Kidger, J. Morrill, J. Foster, T. Lyons. *Neural controlled
    differential equations for irregular time series.* NeurIPS, 2020.

[^morrill2021]: J. Morrill, C. Salvi, P. Kidger, J. Foster. *Neural rough differential
    equations for long time series.* ICML, 2021.

[^walker2024]: B. Walker et al. *Log neural controlled differential equations: The Lie
    brackets make a difference.* ICML, 2024.

[^walker2025]: B. Walker et al. *SLiCEs: Structured linear continuous-time equations
    for efficient sequence modelling.* arXiv, 2025.

[^arroyo2024]: A. Arroyo, C. Salvi, et al. *Rough Transformers: Lightweight
    continuous-time sequence modelling with path signatures.* NeurIPS, 2024.

[^salvi2021]: C. Salvi, T. Cass, J. Foster, T. Lyons, W. Yang. *The signature kernel is
    the solution of a Goursat PDE.* SIAM Journal on Mathematics of Data Science,
    3(3):873–899, 2021.

[^issa2024]: Z. Issa, B. Horvath, M. Lemercier, C. Salvi. *Non-adversarial training of
    Neural SDEs with signature kernel scores.* NeurIPS, 2024.

[^cuchiero2021]: C. Cuchiero, L. Gonon, L. Grigoryeva, J.-P. Ortega, J. Teichmann.
    *Expressive power of randomized signature.* NeurIPS Workshop, 2021.

[^barancikova2025]: B. Barančíková, Z. Huang, C. Salvi. *SigDiffusions: Score-based
    diffusion models for time series via log-signature embeddings.* ICLR, 2025.
