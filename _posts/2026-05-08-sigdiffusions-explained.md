---
layout: post
title: "SigDiffusions: Generating Time Series in Log-Signature Space"
date: 2026-05-08
description: A summary of sigdiffusion paper.
tags: [diffusion, signatures, rough-paths, generative-models, time-series]
math: true
---

> *Diffusion models conquered images. Why are they still awkward on time series? And
> what happens if we run the diffusion in a smarter coordinate system instead of in
> raw pixels of time?*

Generative modeling of time series is, frankly, embarrassing compared to generative
modeling of images. Stable Diffusion can produce a photorealistic 1024×1024 picture in
under a second. The state of the art for synthetic ECGs, financial returns, or hospital
vital signs is, by comparison, much further behind. There is no time-series GPT yet.

Why? Because time series have structural properties that pixel-style diffusion is bad
at: irregular sampling, multi-scale temporal dependencies, an inherent continuous-time
structure, and channel correlations that span very different scales of variation. A
diffusion model that adds isotropic Gaussian noise to a tensor of shape `(length,
channels)` ignores all of this.

**SigDiffusions** [^barancikova2025], introduced by Barbora Barančíková, Zhuoyue Huang,
and Cristopher Salvi at ICLR 2025, takes a beautifully different approach: instead of
diffusing in the raw time-series coordinates, **diffuse in log-signature coordinates**,
where the time series has been encoded into a fixed-dimensional vector by the path
signature. Combined with a closed-form inversion, this turns time-series generation
into a clean Euclidean diffusion problem.

This post explains what SigDiffusions does, why it works, what it gets right, and what
its limitations are. (For background on rough paths and signatures, see [the companion
post](/writing/2026/05/08/rough-paths-for-ml/).)

---

## 1. The high-level picture

The SigDiffusions pipeline has six steps:

1. **Augment** every time series with a deterministic time/Fourier augmentation.
2. **Compute the log-signature** of every augmented path, yielding a fixed-dimension
   feature vector per training example.
3. **Train a score-based diffusion model** on these log-signature vectors as if they
   were ordinary points in $\mathbb{R}^D$.
4. **Sample** from the trained diffusion to obtain a synthetic log-signature.
5. **Invert** the synthetic log-signature back to a time series via a closed-form
   Fourier formula.
6. (Optional) Postprocess: rescale, denormalize, etc.

The blue box (steps 2 and 5) is fully deterministic. The orange box (steps 3 and 4) is
a standard score model. The trick that makes it all work is that closed-form Fourier
inversion in step 5 — without it, signature-space diffusion would be useless because
nobody can invert an arbitrary signature back to a path.

I will walk through each step, then assess what is genuinely new and what is not.

---

## 2. Why log-signature space?

### The naive baseline: diffusion on raw time series

Treat a time series of length $L$ and $d$ channels as a tensor of shape $(L, d)$ and
run a U-Net diffusion model on it. This works, sort of. CSDI [^csdi], SSSD [^sssd], and
TSDiff [^tsdiff] are well-developed examples. But there are problems:

- **Cost scales with $L$.** Doubling the sequence length doubles compute.
- **Multi-scale dependencies.** A long series has structure at many scales — daily,
  weekly, seasonal — and a U-Net at fixed receptive field captures only some of them.
- **Irregular sampling.** Pixel-style diffusion assumes a uniform grid.
- **Per-step noise is unstructured.** Adding isotropic Gaussian noise to a time series
  is meaningless temporally — it does not respect any continuous-time structure.

### What log-signature buys you

The log-signature $\mathrm{LogSig}^{\le n}(x)$ of a $d$-channel time series, computed
to truncation level $n$, is a vector in the free nilpotent Lie algebra
$\mathfrak{g}^n(\mathbb{R}^d)$, which is a finite-dimensional Euclidean vector space of
dimension given by the Witt formula:

$$
\dim \mathfrak{g}^n(\mathbb{R}^d)
\;=\;
\sum_{k=1}^n \frac{1}{k}\sum_{j \mid k} \mu(j)\, d^{k/j}.
$$

This dimension is **independent of $L$**. A length-$1000$ and a length-$100$ series
both produce log-signature vectors of the same size. The signature compresses
the temporal information into a fixed-dimensional vector that captures the *shape* of
the path with provable factorial-decay error guarantees [^lyons1998][^friz2010].

So if you can train a diffusion model in this fixed-dimensional space, you get:

- **Length-independent state size.** Generating a longer series costs the same as a
  shorter one.
- **Native irregular-sampling tolerance.** Signatures are computed by interpolating
  the observed points; sampling grid does not affect the diffusion.
- **A Euclidean target.** The Lie algebra is a vector space; ordinary score-based
  diffusion just works.
- **Continuous-time decoder.** Once you invert, you can evaluate the path at any time.

This is the central insight of SigDiffusions. Everything else is execution.

### Why *log*-signature, not signature?

The signature itself is constrained: it must satisfy the **shuffle relations** (a
combinatorial system of algebraic identities), which means valid signatures form a
nonlinear submanifold of the tensor algebra called the **free nilpotent Lie group**
$G^n(\mathbb{R}^d)$. Adding Gaussian noise to a signature would push it off this
manifold, producing invalid signatures.

The log-signature solves this. Apply the formal logarithm: $\mathrm{LogSig} = \log
\circ \mathrm{Sig}$. The result lives in the Lie *algebra* $\mathfrak{g}^n(\mathbb{R}^d)$,
which is a *vector subspace* of the tensor algebra closed under linear combinations.
Gaussian noise in any Hall–Lyndon basis [^reutenauer1993] keeps you in the algebra.
The algebra and group are in bijection via $\exp$ and $\log$ (truncated polynomial maps
on a nilpotent space), so no information is lost.

This is why the SigDiffusions diagram says: "Converting to log-signatures maps them to
a Euclidean space (Lie algebra) where standard diffusion models operate." It is
literally true.

---

## 3. The Fourier augmentation trick

This is the part that I think is most underappreciated about SigDiffusions, and it is
also the part that makes the closed-form inversion possible.

Before computing the signature, every path is augmented from $d$ channels to $d + 3$
channels:

$$
x^{\text{aug}}(s) \;=\; \big(s,\; \sin s,\; \cos s - 1,\; x_1(s),\; \dots,\; x_d(s)\big),
\qquad s \in [0, 2\pi].
$$

(The clock $s$ is rescaled from physical time to $[0, 2\pi]$.) The first three channels
are deterministic — they are the same for every path in the dataset. The last $d$
channels are the actual data.

### Why this specific augmentation?

The genius is that **the iterated integrals of the data channels against the
deterministic Fourier channels** are exactly the **Fourier coefficients of the data
path**.

Concretely, the signature coordinate $S^{\sin, i}(x^{\text{aug}})$ — the iterated
integral $\int_0^{2\pi} \int_0^{t_2} d(\sin s)\, dx_i(s)$ — works out, by integration
by parts, to be a linear combination of the Fourier coefficients of channel $i$.
Similarly for higher-order iterated integrals against $\cos s - 1$, against $\sin(2s)$
(which appears via shuffles), and so on.

Barančíková et al. [^barancikova2025] derive **closed-form formulas** that express the
Fourier coefficients of each data channel as **explicit polynomial functions** of
specific signature components. For a band-limited path of degree $\le M$, you need
truncation level $n = O(M)$ to recover all $2M + 1$ Fourier coefficients per channel.

### What this gives you

The map "Fourier coefficients → log-signature" is a polynomial embedding $\Phi$ from
$\mathbb{R}^{d(2M+1)}$ into $\mathfrak{g}^n(\mathbb{R}^{d+3})$. The map "log-signature
→ Fourier coefficients" is its polynomial left-inverse $\Phi^{\dagger}$, which is the
**closed-form Fourier inversion** of step 5 of the SigDiffusions pipeline.

This is the secret weapon. Without it, you would generate a synthetic log-signature
and then have no idea how to turn it back into a time series. With it, you reconstruct
the path exactly, up to Fourier truncation error of degree $M$ — which decays at the
data's smoothness rate.

### A subtle point: realizability

Here is an honest catch that the paper handles but does not dwell on. The map $\Phi$
embeds the *Fourier-coefficient space* into the Lie algebra $\mathfrak{g}^n$, but its
image $\mathcal{M} := \Phi(\mathbb{R}^{d(2M+1)})$ is a low-dimensional algebraic
subset, not the whole of $\mathfrak{g}^n$. The diffusion model's training distribution
is supported on $\mathcal{M}$, but its generated samples — being samples from a
full-dimensional Gaussian transported by a learned score field — can drift off
$\mathcal{M}$.

When you apply $\Phi^{\dagger}$ to an off-manifold point, you still get *some* Fourier
coefficients out, but they no longer correspond to the originally-generated
log-signature in any rigorous sense. In practice the model learns to stay close to
$\mathcal{M}$ and the inversion gives a perfectly fine path. But this is the door
through which SigFlow (a flow-matching successor we have written about elsewhere)
walks: by generating in Fourier-coefficient space directly, you stay on the manifold
by construction.

For SigDiffusions itself, the authors demonstrate empirically that the off-manifold
issue is not severe enough to break the method, and the closed-form inversion remains
robust. It is a genuine theoretical loose end but not a practical blocker.

---

## 4. The diffusion model itself

This is the most conventional part of SigDiffusions and I will be brief.

Once each training time series has been encoded into a log-signature vector
$\ell \in \mathbb{R}^D$, you train a standard score-based diffusion model
[^song2020][^ho2020] on these vectors. The forward process is

$$
\ell_\tau \;=\; \alpha_\tau \ell_0 + \sigma_\tau \varepsilon, \quad \varepsilon \sim
\mathcal{N}(0, I),
$$

and the model learns the score $\nabla_\ell \log p_\tau(\ell)$. Sampling runs the
reverse SDE for some 500–1000 steps.

The architecture is a transformer that processes the log-signature degree-by-degree.
Each "level" of the log-signature (degree-1 components, degree-2 components, etc.) is
treated as a token, and full self-attention runs across them. The `by_channel`
configuration option in the released code computes a separate signature per data
channel and stacks them, which keeps dimension manageable for high-$d$ datasets.

This part is not novel — it is a straight application of score-based diffusion in
$\mathbb{R}^D$. But the choice of $D$, and the algebraic structure underneath, is what
makes the whole pipeline work.

---

## 5. Inversion: the closed-form Fourier formula

Once a synthetic log-signature $\hat\ell$ has been sampled, inversion proceeds:

1. Exponentiate: $\hat S = \exp(\hat\ell) \in T^{(n)}(\mathbb{R}^{d+3})$. The exponential
   on a nilpotent algebra is a finite truncated polynomial.
2. Extract the relevant signature coordinates (the coefficients corresponding to mixed
   words involving the deterministic augmentation channels and the data channels).
3. Apply the explicit polynomial formulas of Barančíková et al. [^barancikova2025] to
   read off the Fourier coefficients $\hat c$ of each data channel.
4. Reconstruct the time series:

   $$
   \hat x_i(s) \;=\; \hat c^{(i)}_0 \cdot \frac{s}{2\pi}
   \;+\; \sum_{k=1}^{M} \Big( \hat a^{(i)}_k \sin(ks) + \hat b^{(i)}_k (\cos(ks) - 1) \Big).
   $$

The reconstruction error is purely Fourier truncation error — the part of the data
path that does not lie in the trigonometric polynomial space of degree $\le M$. For
smooth data this decays rapidly with $M$.

That step 3 has a *closed-form* polynomial formula is the deepest contribution of the
paper. It means inversion is essentially free at sampling time: a few polynomial
evaluations per channel, no iterative optimization, no neural inverse network.

---

## 6. What SigDiffusions gets right

Three things stand out to me as genuine wins.

### 6.1 Length-independent state size

The signature dimension is determined by $d$ (channels) and $n$ (truncation), not by
$L$ (length). For a 7-channel series of length 720 with $n = 4$, the log-signature
sits in roughly 715 dimensions; for length 96, the same. Generation cost is the same.
This is the right way to make a generative model that does not care about sequence
length.

### 6.2 Closed-form inversion

Most generative models for structured data — graphs, point clouds, sets — have to
learn an inversion or use approximate inversion. SigDiffusions's closed-form Fourier
inversion is exact, deterministic, and adds essentially zero cost at sampling. This is
unusual and elegant.

### 6.3 Principled Lie-algebraic foundation

The Lie group / Lie algebra story (signatures live in $G^n$, log-signatures in
$\mathfrak{g}^n$, $\exp$ and $\log$ are nilpotent polynomial bijections) is not
hand-waving — it is the mathematically correct framework, and it tells you precisely
why diffusion in log-signature space is *Euclidean* diffusion. This kind of conceptual
clarity is rare in generative modeling for structured data.

---

## 7. Where it falls short

I want to be honest. SigDiffusions is a real advance, but it has limitations.

### 7.1 Single global representation

A single log-signature is computed over the *entire* time series. For long sequences,
this requires raising the truncation depth $n$ to capture fine-grained dynamics, and
$\dim \mathfrak{g}^n$ grows polynomially in $n$ with degree equal to the channel count
$d + 3$. For very long, multi-scale series (think weeks of EEG, or years of climate
data), a single signature is not the right granularity.

A locality-aware variant (compute signatures over short windows and combine
hierarchically) would address this. Several recent followups, including ours, take
this direction.

### 7.2 Slow sampling

Score-based diffusion needs 500–1000 reverse-SDE steps. This is the standard slow-mode
problem of diffusion models, inherited unchanged from the score-matching framework.
Replacing diffusion with **flow matching** [^lipman2023][^liu2023][^tong2024], which
needs only 10–50 ODE steps for comparable quality, is an obvious upgrade. Again, this
is what newer signature-space generators (including our SigFlow draft) explore.

### 7.3 No native conditional generation

Forecasting, imputation, and interpolation are first-class operations for time-series
practitioners. SigDiffusions is unconditional: it generates whole series. To do
forecasting you would need to condition the diffusion on partial information, which
the global-signature representation makes awkward — you would have to encode
"observed first half" into the same global log-signature space, which is not what
log-signatures are designed for. Local-window approaches handle this much more
cleanly via masking.

### 7.4 The off-manifold issue

As discussed in §3, the diffusion's generated points may drift off the
augmentation-realizable manifold $\mathcal{M}$. Empirically the inversion remains
serviceable, but theoretically the inversion guarantee only applies on $\mathcal{M}$.
A method that generates *on* $\mathcal{M}$ by construction (for example, by generating
Fourier coefficients directly and computing signatures only as features) closes this
gap.

### 7.5 The often-stated objection that is *not* a real issue

You may have read or heard that "Gaussian noise in signature space violates the Lie
group structure". This is wrong, or at least misleading. SigDiffusions operates in the
Lie *algebra* $\mathfrak{g}^n$, not the Lie group. The Lie algebra is a vector space.
Gaussian noise in any basis stays in $\mathfrak{g}^n$. The Lie-group structure
objection applies to a hypothetical method that diffuses in the *signature* space
$G^n$ (a curved manifold), not to SigDiffusions. SigDiffusions is fine on this front.

---

## 8. How does it perform?

The published benchmarks [^barancikova2025] cover synthetic and real datasets:
**Sines**, **Predator-Prey**, **HEPC** (household electricity), **Exchange Rates**,
and **Weather**. SigDiffusions is competitive with or beats:

- TimeGAN [^timegan]
- GT-GAN [^gtgan]
- CSDI [^csdi]
- Diffusion-TS
- a baseline VAE for time series

on standard distributional metrics (discriminative score, predictive score,
Wasserstein-1 on signatures) and on visual inspection of generated samples. The
margin is not always huge — for short sequences the pixel-style baselines do
respectably — but as series get longer, SigDiffusions's length-independence shows.

The most striking result is **sample efficiency**: SigDiffusions trains stably with
relatively few examples because the log-signature is such an information-dense
representation. On Sines, you can fit a useful generator with hundreds of training
paths, not thousands.

---

## 9. What this opens up

Even as the first paper in its family, SigDiffusions points at several directions
that I think will define generative modeling of time series over the next few years:

- **Hierarchical / multi-resolution signatures.** Single global log-signature → local
  log-signatures over a tree of windows, with Chen's identity providing exact
  consistency between scales.
- **Flow matching in signature or coefficient space.** Faster sampling, cleaner
  conditioning, and (in coefficient space) provable on-manifold generation.
- **Conditional generation as masking.** Forecasting and imputation as first-class
  operations via leaf-level masking on a hierarchical signature representation.
- **Foundation models for time series.** A signature-based encoder is naturally
  variable-length and irregular-sample-tolerant; pair it with a generative head and
  you have the right object.
- **Beyond Fourier augmentation.** The same closed-form-inversion trick works for
  other carefully chosen augmentations (polynomial bases, wavelet bases). Picking the
  right basis for the right data class is open.

I work on a successor (SigFlow) that addresses several of these directly: a dyadic
tree of locally Fourier-augmented windows, flow matching in path-coefficient space,
and a coarse-to-fine sampler that enforces Chen's identity exactly by group inversion
at every internal split. But that is a different post.

---

## 10. Should you use SigDiffusions today?

Yes, if any of the following describes your problem:

- Your time series are reasonably short (length up to a few hundred).
- They have multi-channel structure with non-trivial inter-channel dependencies.
- You have a small-to-medium training set (signatures are sample-efficient).
- You want unconditional generation of synthetic samples — for data augmentation,
  privacy, simulation studies, etc.
- You are willing to spend a little time on the Fourier-augmentation pipeline.

No, or proceed with caution, if:

- Your sequences are very long (thousands of points) and have multi-scale structure.
  A locality-aware variant will serve you better.
- You need fast sampling (real-time, online generation). Score-based diffusion is
  too slow.
- You need conditional generation (forecasting, imputation). Use CSDI or a
  flow-matching successor.

For learning purposes, the [SigDiffusions GitHub repo](https://github.com/...) is
clean and runnable. The core code is short — `iisignature` does the signature heavy
lifting, and the diffusion model is a standard transformer score model. You can read
the whole pipeline in an afternoon.

---

## 11. The takeaway

SigDiffusions's contribution is not a fancier denoiser. It is the recognition that
**the right coordinate system for generating time series is the log-signature** — a
fixed-dimensional, Euclidean, Lie-algebra-valued, length-independent encoding — paired
with a closed-form inversion that makes generation invertible.

This is a good example of the broader principle behind much recent work in generative
modeling: the choice of *latent space* matters more than the choice of *score model*.
Latent diffusion in the right space beats high-dimensional pixel diffusion at almost
everything. Rough path theory has been telling us for thirty years what the right
latent space for paths is. SigDiffusions is the first generative model that listens.

---

## References

[^barancikova2025]: B. Barančíková, Z. Huang, C. Salvi. *SigDiffusions: Score-based
    diffusion models for time series via log-signature embeddings.* ICLR, 2025.
    [openreview.net/forum?id=Y8KK9kjgIK](https://openreview.net/forum?id=Y8KK9kjgIK)

[^lyons1998]: T. Lyons. *Differential equations driven by rough signals.* Revista
    Matemática Iberoamericana, 14(2):215–310, 1998.

[^friz2010]: P. Friz, N. Victoir. *Multidimensional Stochastic Processes as Rough
    Paths.* Cambridge University Press, 2010.

[^reutenauer1993]: C. Reutenauer. *Free Lie Algebras.* Oxford University Press, 1993.

[^song2020]: Y. Song, J. Sohl-Dickstein, D. Kingma, A. Kumar, S. Ermon, B. Poole.
    *Score-based generative modeling through stochastic differential equations.*
    ICLR, 2021.

[^ho2020]: J. Ho, A. Jain, P. Abbeel. *Denoising diffusion probabilistic models.*
    NeurIPS, 2020.

[^lipman2023]: Y. Lipman, R. T. Q. Chen, H. Ben-Hamu, M. Nickel, M. Le. *Flow
    matching for generative modeling.* ICLR, 2023.

[^liu2023]: X. Liu, C. Gong, Q. Liu. *Flow straight and fast: Learning to generate
    and transfer data with rectified flow.* ICLR, 2023.

[^tong2024]: A. Tong et al. *Improving and generalizing flow-based generative models
    with minibatch optimal transport.* TMLR, 2024.

[^csdi]: Y. Tashiro, J. Song, Y. Song, S. Ermon. *CSDI: Conditional score-based
    diffusion models for probabilistic time series imputation.* NeurIPS, 2021.

[^sssd]: J. L. Alcaraz, N. Strodthoff. *Diffusion-based time series imputation and
    forecasting with structured state space models.* TMLR, 2023.

[^tsdiff]: M. Kollovieh et al. *Predict, refine, synthesize: Self-guiding diffusion
    models for probabilistic time series forecasting.* NeurIPS, 2023.

[^timegan]: J. Yoon, D. Jarrett, M. van der Schaar. *Time-series generative
    adversarial networks.* NeurIPS, 2019.

[^gtgan]: J. Jeon et al. *GT-GAN: General purpose time series synthesis with
    generative adversarial networks.* NeurIPS, 2022.
