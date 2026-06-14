# Altrion Financial Health Score (AFHS) — Complete Technical Guide

> **Version:** V2 · **Last Updated:** 2026-03-24
> **Engine:** `app/services/health_score.py` · **Endpoint:** `GET /api/portfolio/health`

---

## Table of Contents

1. [What Was Built](#1-what-was-built)
2. [What Still Needs to Be Built (V3)](#2-what-still-needs-to-be-built-v3)
3. [Score Formula Overview](#3-score-formula-overview)
4. [Life Stage Weights](#4-life-stage-weights)
5. [Completeness Scalar](#5-completeness-scalar)
6. [Dimension Breakdown](#6-dimension-breakdown)
   - [D1 — Liquidity Foundation](#d1--liquidity-foundation)
   - [D2 — Traditional Investment Health](#d2--traditional-investment-health)
   - [D3 — Retirement Readiness](#d3--retirement-readiness)
   - [D4 — Crypto Portfolio Health](#d4--crypto-portfolio-health)
   - [D5 — DeFi Position Health](#d5--defi-position-health)
   - [D6 — Debt & Liability Health](#d6--debt--liability-health)
   - [D7 — Wealth Velocity](#d7--wealth-velocity)
7. [Real User Examples](#7-real-user-examples)
8. [Score Improvement Cheat Sheet](#8-score-improvement-cheat-sheet)
9. [API Response Shape](#9-api-response-shape)
10. [Known Limitations in V2](#10-known-limitations-in-v2)

---

## 1. What Was Built

### Backend

| Component | File | Status |
|---|---|---|
| AFHS scoring engine — D1, D2, D4, D6, D7 | `app/services/health_score.py` | ✅ Done |
| D3 Retirement Readiness scoring | `app/services/health_score.py` | ✅ Done |
| D5 DeFi Position Health scoring | `app/services/health_score.py` | ✅ Done (2026-03-24) |
| Moralis DeFi position fetcher (5 chains) | `app/services/providers/defi.py` | ✅ Done (2026-03-24) |
| V2 weight tables (D5 active) | `app/services/health_score.py` | ✅ Done (2026-03-24) |
| AFHS score history service | `app/services/score_history.py` | ✅ Done (2026-03-24) |
| Portfolio health endpoint | `app/controllers/portfolio.py` | ✅ Done |
| Score history endpoint | `app/controllers/portfolio.py` | ✅ Done (2026-03-24) |
| Health response schema (D3+D5+breakdown+solvency_tier) | `app/schemas/health.py` | ✅ Done |
| HealthHistoryResponse schema | `app/schemas/health.py` | ✅ Done (2026-03-24) |
| User profile fields (DOB, income) | `app/models/user.py` | ✅ Done |
| wallet_address field on User | `app/models/user.py` | ✅ Done (2026-03-24) |
| AfhsScore SQLAlchemy model | `app/models/afhs_score.py` | ✅ Done (2026-03-24) |
| Profile update endpoint | `app/controllers/auth.py` | ✅ Done |
| DB migration — user profile fields | `migrations/add_user_profile_fields.sql` | ✅ Applied |
| DB migration — afhs_scores table | `scripts/add_afhs_scores_table.sql` | ✅ Applied |
| DB migration — wallet_address + d5 columns | `migrations/add_wallet_address_and_d5.sql` | ✅ Applied (2026-03-24) |

**All database columns on `public.users`:**
```sql
date_of_birth       DATE
annual_income       NUMERIC(15, 2)
income_source       VARCHAR(50)   -- 'employment' | 'self_employed' | 'investment' | 'retirement' | 'other'
years_to_retirement INTEGER
wallet_address      VARCHAR(42)   -- EVM address for D5 DeFi scoring
```

### Frontend

| Component | File | Status |
|---|---|---|
| `PortfolioHealth` + `DimensionScores` TypeScript types | `src/types/health.types.ts` | ✅ Done |
| `HealthHistoryPoint` + `HealthHistoryResponse` types | `src/types/health.types.ts` | ✅ Done (2026-03-24) |
| Health card — all 7 dimension bars + life stage + solvency tier | `src/pages/dashboard/components/PortfolioHealthCard.tsx` | ✅ Done |
| Score history chart (Recharts, 30D/90D/1Y toggle) | `src/pages/dashboard/components/ScoreHistoryChart.tsx` | ✅ Done (2026-03-24) |
| `usePortfolioHealth()` hook | `src/hooks/queries/usePortfolio.ts` | ✅ Done |
| `useHealthHistory()` hook | `src/hooks/queries/usePortfolio.ts` | ✅ Done (2026-03-24) |
| `getHealthHistory()` service method | `src/services/portfolio.service.ts` | ✅ Done (2026-03-24) |
| Profile form (DOB + income fields) | `src/pages/dashboard/components/ProfileHeader.tsx` | ✅ Done |
| Auth service profile update | `src/services/auth.service.ts` | ✅ Done |
| User type (dateOfBirth, income) | `src/types/user.types.ts` | ✅ Done |

### API Endpoints

```
GET    /api/portfolio/health            → AFHS score + D1-D7 + breakdown + solvency_tier
GET    /api/portfolio/health/history    → last N days of score snapshots (default 90)
PATCH  /api/auth/profile                → update name, date_of_birth, annual_income, income_source
GET    /api/auth/me                     → includes date_of_birth, annual_income, income_source
```

---

## 2. What Still Needs to Be Built (V3)

| Feature | Why It Matters | Impact on Score | Requires | Complexity |
|---|---|---|---|---|
| **Wallet address UI** | Users have no way to input `wallet_address` — D5 is dead without it | Unlocks D5 | Nothing | Low |
| **D6 — Real Liability Data** | Assumes debt-free (very generous). Biggest distortion in current scores. | ±10–20 pts | Plaid liabilities | Medium |
| **D1 — Real Expense History** | Estimates at 60% income. Real Plaid tx data improves D1 accuracy. | ±5–10 pts | Plaid transactions | Medium |
| **D7 — Contribution History** | Contribution consistency is neutral (50). Needs 12-month Plaid deposits. | +3–6 pts | Plaid transactions | Medium |
| **D3 — Real Retirement Data** | Equity-as-proxy replaced by actual 401k/IRA balance. | +3–8 pts | Plaid retirement | Medium |
| **Structural Solvency Multiplier (SSM)** | Reduces score when liabilities > LAAV. Code-ready, needs D6 real data. | Guard rail | Plaid liabilities | Low |
| **30-day EWMA Volatility for D4** | More stable than noisy 24h change proxy. | ±2–5 pts | Price history in DB | Medium |
| **Score improvement AI tips** | GPT/Groq personalized tips per weak dimension shown in UI | UX | Groq key (exists) | Medium |
| **Peer comparison (Track B)** | Compare your score vs same life stage cohort from `afhs_scores` | UX | afhs_scores data | Low |

---

## 3. Score Formula Overview

```
AFHS_Displayed = round( AFHS_Personal × Completeness_Scalar )

                   Σ( Score_i × Weight_i × Confidence_i )
AFHS_Personal  =  ─────────────────────────────────────────
                       Σ( Weight_i × Confidence_i )
```

- **Score_i** — dimension score (0–100)
- **Weight_i** — life-stage-interpolated weight (see Section 4)
- **Confidence_i** — how reliable this dimension's data is (see table below)
- **Completeness_Scalar** — penalizes incomplete data (see Section 5)

### Confidence Values Per Dimension (V1)

| Dimension | Confidence | Reason |
|---|---|---|
| D1 Liquidity | 1.00 (100%) | Cash/stablecoin balances are exact |
| D2 Investment | 0.85 (85%) | Equity data is reliable; no brokerage sub-types |
| D4 Crypto | 0.90 (90%) | On-chain + exchange data is accurate |
| D6 Debt | 0.70 (70%) | Assumed debt-free — low confidence until Plaid liabilities connected |
| D7 Velocity | 0.75 (75%) | 24h change is noisy; full contribution history not yet available |

> **Why confidence matters:** A score of 80 at 70% confidence contributes less than a score of 80 at 100% confidence. This prevents unreliable dimensions from dominating the composite.

---

## 4. Life Stage Weights

Your **date of birth** controls how much each dimension matters. Weights interpolate **smoothly** between midpoints (not hard cutoffs at age boundaries).

**V1 weights (D5 inactive):**

| Age | Stage | D1 | D2 | D3 | D4 | D6 | D7 |
|---|---|---|---|---|---|---|---|
| 18–34 | Early Career | 18% | 26% | 16% | 21% | 12% | 7% |
| 35–54 | Mid Career | 18% | 26% | 20% | 18% | 12% | 6% |
| 55–62 | Pre-Retirement | 21% | 24% | 24% | 15% | 11% | 5% |
| 63+ | Retirement | 25% | 24% | 26% | 11% | 10% | 4% |

**V2 weights (D5 active — wallet address set + DeFi positions found):**

| Age | Stage | D1 | D2 | D3 | D4 | D5 | D6 | D7 |
|---|---|---|---|---|---|---|---|---|
| 18–34 | Early Career | 17% | 24% | 15% | 19% | 6% | 12% | 7% |
| 35–54 | Mid Career | 17% | 24% | 19% | 16% | 6% | 12% | 6% |
| 55–62 | Pre-Retirement | 20% | 23% | 23% | 13% | 5% | 11% | 5% |
| 63+ | Retirement | 24% | 23% | 25% | 10% | 4% | 10% | 4% |

**Interpolation example:** A 43-year-old sits exactly at the Mid-Career midpoint. A 50-year-old is interpolated between Mid (midpoint 43) and Pre-Retirement (midpoint 58), so their D1 weight = 18% + (7/15) × (21%−18%) = **19.4%**.

**Without date of birth:** System defaults to age 30 (Early Career weights). Set your DOB in Profile to get accurate life-stage scoring.

---

## 5. Completeness Scalar

```
Scalar = 0.5 + ( 0.5 × log(1 + n) / log(8) )
```

`n` = number of active scoring dimensions (min 2, max 6).

| Active Dimensions | Scalar | Scenario |
|---|---|---|
| 2 | 0.764 | Very limited data — heavy penalty |
| 3 | 0.833 | Some data but major gaps |
| 4 | 0.887 | No crypto, no DeFi |
| 5 | 0.931 | No crypto OR no wallet address |
| **6** | **0.968** | **Standard V2 (all dims except D5 or D4)** |
| 7 | 1.000 | All 7 dims active (D4 + D5 + all others) |

**Standard maximum score: ~97** (6 active dims, scalar = 0.968). Full 100 requires all 7 dims active (D4 crypto + D5 DeFi simultaneously).

---

## 6. Dimension Breakdown

---

### D1 — Liquidity Foundation

> **Weight:** 18–25% · **Confidence:** 100%

```
D1 = (Cash Reserve Score × 0.50)
   + (Stablecoin Quality Score × 0.25)
   + (Buffer Trend Score × 0.25)
```

#### Sub-A: Cash Reserve Score (50% of D1)

Measures how many months of living expenses you can cover with cash + stablecoins.

```
months_covered = (cash + stablecoins) / avg_monthly_expenses
cash_score = min(100, log(1 + months_covered) / log(1 + target_months) × 100)
```

**Target months by life stage:**

| Stage | Target | Reasoning |
|---|---|---|
| Early (18–34) | 3 months | Still building wealth; 3 months is the standard emergency fund |
| Mid (35–54) | 5 months | More obligations, higher expenses, longer job search if needed |
| Pre-Retirement (55–62) | 8 months | Approaching fixed income; larger cushion required |
| Retirement (63+) | 18 months | Needs to bridge market downturns without selling |

**Score examples (Early career, target = 3 months, expenses = $3,000/mo):**

| Liquid Cash + Stablecoins | Months Covered | D1-A Score |
|---|---|---|
| $0 | 0 months | 0 |
| $3,000 | 1 month | 56 |
| $6,000 | 2 months | 79 |
| $9,000 | 3 months (target) | 100 |
| $18,000 | 6 months | 100 (capped) |

**When no expense data available:** Cash reserve defaults to **50 (neutral)**.
**When annual income is set:** Estimates expenses at **60% of monthly gross income**.

#### Sub-B: Stablecoin Quality Score (25% of D1)

Not all stablecoins are equal. Each has a liquidity quality weight:

| Stablecoin | Weight | Why |
|---|---|---|
| USDC | 1.00 | Regulated, Circle-backed, monthly attestations |
| DAI | 0.95 | Over-collateralized by crypto, decentralized |
| USDT (Tether) | 0.85 | Largest by volume but less transparent reserves |
| BUSD | 0.85 | Binance-issued, regulatory concerns |
| TUSD / GUSD | 0.80 | Less liquidity, smaller issuer |
| LUSD | 0.75 | Liquity protocol, algorithmic component |
| FRAX | 0.70 | Partially algorithmic, higher depeg risk |

**Formula:** `quality_score = (Σ value_i × weight_i) / total_stablecoin_value × 100`

**Example:** $7,000 USDC + $3,000 FRAX = `(7000×1.0 + 3000×0.70) / 10000 × 100 = 91`

If you hold **no stablecoins**, this sub-score defaults to **100** (not penalized — you just don't have stablecoins).

#### Sub-C: Buffer Trend Score (25% of D1)

Measures whether your liquid buffer has been growing or shrinking over the past 60 days.
**V1 default: 50 (neutral)** — requires Plaid transaction history (V2).

---

### D2 — Traditional Investment Health

> **Weight:** 24–26% · **Confidence:** 85%

```
D2 = (Equity Deployment × 0.40)
   + (Diversification × 0.35)
   + (Concentration × 0.25)
```

#### Sub-A: Equity Deployment Score (40% of D2)

Measures how much of your **non-crypto capital** is deployed in equities.

```
non_crypto_base = equity + cash + stablecoins
deployment_rate = equity_value / non_crypto_base
deployment_score = min(100, deployment_rate × 120)    ← 83% deployed = perfect score
```

> **Key design:** Crypto is excluded from the base. A person with $80k BTC and $20k equity is judged on whether they're deploying that $20k wisely — not penalized for choosing crypto over bonds.

| Scenario | Equity | Non-Crypto Base | Rate | Score |
|---|---|---|---|---|
| $20k equity + $5k USDC | $20k | $25k | 80% | 96 |
| $10k equity + $10k USDC | $10k | $20k | 50% | 60 |
| $0 equity + $10k USDC | $0 | $10k | 0% | 0 |
| Pure crypto (no cash at all) | $0 | $0 | N/A | 50 (neutral) |

#### Sub-B: Diversification Score (35% of D2)

Counts how many distinct asset **classes** you hold across your entire portfolio.

| Asset Classes Present | Score | Label |
|---|---|---|
| 1 (e.g. equity only, or crypto only) | 30 | Poor |
| 2 (e.g. equity + crypto) | 60 | Fair |
| 3 (equity + crypto + cash/stablecoins) | 90 | Good |
| 4+ (V2: adds bonds, REITs) | 100 | Excellent |

**What counts as each class:**
- `equity` — any `asset_class = "equity"` holding (stocks, ETFs)
- `crypto` — any non-stablecoin crypto (BTC, ETH, SOL, etc.)
- `cash_equivalent` — cash holdings OR any stablecoin (USDC, DAI, USDT, etc.)

#### Sub-C: Concentration Score (25% of D2)

Measures the largest **equity** position as a % of your **total equity value**.
(Crypto concentration is handled separately in D4 — no double-penalization.)

| Largest Single Equity % | Score | Example |
|---|---|---|
| ≤ 25% | 100 | $100k equity: no position > $25k |
| 25–40% | 75 | $40k AAPL in $100k equity portfolio |
| 40–60% | 45 | $55k AAPL in $100k equity portfolio |
| > 60% | 20 | $70k AAPL in $100k equity portfolio |

**No equity positions:** Score = 75 (neutral — D4 handles crypto concentration).

---

### D3 — Retirement Readiness

> **Weight:** 16–26% · **Confidence:** 60–80% · **Active in V1 with equity-as-proxy**

```
D3 = (Accumulation Benchmark × 0.50)
   + (Contribution Rate      × 0.30)
   + (Allocation Quality     × 0.20)
```

**Requires `annual_income` to be set in Profile.** Without it, D3 returns a neutral 50 at 60% confidence.

#### Sub-A: Accumulation Benchmark Score (50% of D3)

Compares your retirement balance against an age-based income multiple, adjusted by a graduation factor that accounts for years until penalty-free withdrawal (age 59.5).

**Income multiple benchmarks:**

| Age | Target Multiple |
|---|---|
| ≤ 30 | 0.5× income |
| ≤ 40 | 1.5× income |
| ≤ 50 | 4.0× income |
| ≤ 62 | 7.0× income |
| 63+ | 10.0× income |

**Graduation factor** (retirement account liquidity adjustment):

| Years to Age 59.5 | Factor |
|---|---|
| 30+ years | 0.50 (heavily penalized — far from penalty-free) |
| 20–30 years | 0.60 |
| 10–20 years | 0.70 |
| 5–10 years | 0.80 |
| 0–5 years | 0.90 |
| Past 59.5 | 0.95 (fully accessible) |

```
adjusted_balance = retirement_balance × graduation_factor
benchmark = annual_income × target_multiple
accum_score = min(100, adjusted_balance / benchmark × 100)
```

**V1 proxy:** `retirement_balance` uses total equity value (no Plaid retirement separation yet). Confidence = 0.80 with income, 0.60 without.

#### Sub-B: Contribution Rate Score (30% of D3)

**V1 default: 50 (neutral)** — requires Plaid transaction history to measure 12-month 401k/IRA contribution cadence (V2).

#### Sub-C: Allocation Quality Score (20% of D3)

Compares your retirement account's equity allocation against the age-appropriate target (`110 − age`).

```
equity_target = max(0, 110 − age)          # e.g., age 30 → 80% equity target
deviation = |actual_equity_pct − equity_target|
allocation_score = max(0, 100 − deviation × 2)
```

| Age | Equity Target | Actual % | Deviation | Score |
|---|---|---|---|---|
| 30 | 80% | 80% | 0 | 100 |
| 30 | 80% | 60% | 20 | 60 |
| 30 | 80% | 40% | 40 | 20 |
| 55 | 55% | 80% | 25 | 50 |

**V1 proxy:** Assumes 100% equity allocation in the retirement proxy account. This is conservative — a real Plaid 401k feed would show actual bond/cash allocation.

---

### D4 — Crypto Portfolio Health

> **Weight:** 11–21% · **Confidence:** 90% · **Only active if non-stablecoin crypto held**

```
D4 = (Asset Quality     × 0.30)
   + (Concentration     × 0.25)
   + (Custody Health    × 0.20)
   + (Within-Crypto Div × 0.15)
   + (Volatility Profile× 0.10)
```

#### Sub-A: Asset Quality Score (30% of D4)

Scores based on what type of crypto you hold.

```
quality_score = (BTC/ETH_weight × 60) + (large_cap_weight × 40) − (meme_weight × 50)
quality_score = max(0, min(100, quality_score))
```

**Crypto tiers:**

| Tier | Coins | Role in Formula |
|---|---|---|
| Blue Chip | BTC, ETH, WBTC, WETH | +60 per % held |
| Large Cap | SOL, BNB, XRP, ADA, AVAX, DOT, MATIC, LINK, LTC, ATOM, UNI, ALGO, NEAR, AAVE, MKR, CRV, COMP, SNX, SUSHI... | +40 per % held |
| Meme Coin | DOGE, SHIB, PEPE, FLOKI, BONK, WIF, BABYDOGE, SAFEMOON, ELON, SAMO | −50 per % held (penalty) |
| Unknown/Other | Everything else | Not explicitly scored; dilutes blue-chip % |

**Examples:**
- 100% BTC → quality score = 60 (max from blue-chip formula)
- 70% BTC + 30% ETH → quality = 60 (all blue-chip)
- 50% BTC + 50% SOL → quality = `(0.50×60) + (1.0×40)` = 70 (SOL boosts large-cap)
- 50% BTC + 50% DOGE → quality = `(0.50×60) + (0×40) − (0.50×50)` = 30 − 25 = 5 (meme penalty)
- 100% SHIB → quality = 0 − 50 = 0 (capped at 0)

#### Sub-B: Concentration Score (25% of D4)

Measures what % of your **total portfolio** is in non-stablecoin crypto.

**Target ranges by life stage:**

| Stage | Ideal Ceiling | Hard Ceiling | Score at Target | Score at Hard Ceiling |
|---|---|---|---|---|
| Early (18–34) | 35% | 55% | 100 | 30 |
| Mid (35–54) | 25% | 40% | 100 | 30 |
| Pre-Retirement (55–62) | 18% | 28% | 100 | 30 |
| Retirement (63+) | 12% | 20% | 100 | 30 |

- **Below target:** Score interpolates from 70 to 100
- **Between target and ceiling:** Score drops from 70 to 30
- **Between ceiling and 80%:** Score drops from 30 to 10
- **Above 80%:** Score = 5 (extreme overexposure)

**Example (Early career):** Crypto is 30% of portfolio (under 35% target) → score ≈ 86.
**Example (Early career):** Crypto is 65% of portfolio (above 55% ceiling) → score ≈ 20.

#### Sub-C: Custody Health Score (20% of D4)

Where your crypto is held significantly affects safety.

| Custody Type | Examples | Score |
|---|---|---|
| Hardware wallet | Ledger, Trezor | 95 |
| Regulated exchange | Coinbase, Kraken, Gemini, Binance.US | 85 |
| Software/self-custody wallet | MetaMask, Trust Wallet | 75 |
| Unregulated exchange | Binance.com, KuCoin, Bybit, OKX, Gate | 30 |

**Formula:** Weighted average across all your crypto holdings by custody type.

**Example:** $30k on Coinbase + $10k on Binance.com:
`custody = (0.75 × 85) + (0.25 × 30) = 63.75 + 7.5 = 71.25`

#### Sub-D: Within-Crypto Diversification (15% of D4)

Counts distinct non-stablecoin crypto symbols you hold.

| Distinct Coins | Score |
|---|---|
| 1 | 20 |
| 2 | 40 |
| 3 | 60 |
| 4 | 80 |
| 5+ | 100 |

#### Sub-E: Volatility Profile Score (10% of D4)

Compares your portfolio's weighted 24h volatility against BTC's 24h move (baseline ~3%).

- Portfolio moves less than BTC → bonus (up to 120)
- Portfolio moves same as BTC → 100
- Portfolio moves 2× BTC → penalized toward 60
- Formula: `score = max(0, 100 − ((portfolio_vol/btc_vol − 1.0) × 40))`

---

### D5 — DeFi Position Health

> **Weight:** 4–6% · **Confidence:** 85% · **Active only when `wallet_address` is set and DeFi positions exist**

```
D5 = (Protocol Risk         × 0.35)
   + (Yield Sustainability  × 0.30)
   + (Position Health       × 0.20)
   + (Chain Diversification × 0.15)
```

**Requires:** User's EVM wallet address saved to `wallet_address` on the user profile.
**Data source:** Moralis DeFi API — scans Ethereum, Polygon, Arbitrum, Optimism, BSC in parallel.

#### Sub-A: Protocol Risk Score (35% of D5)

Value-weighted average of protocol safety scores. Known protocols are rated 0.50–0.95:

| Protocol | Safety Score | Why |
|---|---|---|
| Aave v2/v3 | 0.95 | Battle-tested, billions TVL, multi-audit |
| Compound v2/v3, Lido, MakerDAO | 0.90 | Blue-chip DeFi, long track record |
| Uniswap v2/v3, Curve | 0.85 | Highly audited DEXes |
| Convex, Yearn, Balancer | 0.80 | Solid but more complex risk surface |
| SushiSwap, PancakeSwap | 0.70 | Lower TVL, more exploits historically |
| Unknown protocol | 0.50 | Default neutral |

`protocol_score = Σ(value_i × safety_i) / total_defi_value × 100`

#### Sub-B: Yield Sustainability Score (30% of D5)

Penalizes positions with unsustainably high APY (yield farms > 50% APY are a red flag).

| APY Range | Weight | Rationale |
|---|---|---|
| ≤ 20% | 100 pts | Sustainable — typical staking/lending rates |
| 20–50% | 65 pts | Moderate risk — possible token inflation |
| > 50% | 15 pts | Unsustainable — likely Ponzi emissions |

`yield_score = (safe_val × 100 + moderate_val × 65 + risky_val × 15) / total_defi_value`

**When APY data is unavailable:** Position is treated as safe (≤ 20%).

#### Sub-C: Position Health Score (20% of D5)

Detects liquidation risk and impermanent loss exposure.

- **Lending positions with health factor ≥ 1.5** → 100 pts (safe)
- **Health factor 1.1–1.5** → 50 pts (approaching risk)
- **Health factor < 1.1** → 20 pts (at risk of liquidation)
- **LP / liquidity positions** → 80 pts (impermanent loss risk discounted)
- **Staking / no health factor** → 100 pts (no liquidation risk)

#### Sub-D: Chain Diversification Score (15% of D5)

Counts distinct chains across all DeFi positions.

| Chains Active | Score |
|---|---|
| 1 | 30 |
| 2 | 60 |
| 3 | 80 |
| 4+ | 100 |

---

### D6 — Debt & Liability Health

> **Weight:** 10–12% · **Confidence:** 70% (low — assumes debt-free in V1)

```
D6 = (High-Interest Debt Score × 0.40)
   + (Debt-to-LAAV Score      × 0.35)
   + (Debt Trajectory Score   × 0.25)
```

#### LAAV — Liquidity-Adjusted Asset Value

Before scoring D6, the system computes your **liquidation value** by weighting each asset class by how quickly it can be converted to cash without significant loss:

```
LAAV = cash × 1.00
     + stablecoins × issuer_weight (0.70–1.00)
     + equity × 0.90
     + BTC/ETH × 0.75
     + large-cap altcoins × 0.55
     + unknown crypto × 0.40
     + meme coins × 0.15
```

**Example (Pre-retirement user):**
```
Portfolio: $200k AAPL + $30k BTC + $20k USDC
LAAV = 20000×1.0 + 200000×0.90 + 30000×0.75
     = 20,000 + 180,000 + 22,500 = $222,500
```

#### Sub-A: High-Interest Debt Score (40% of D6)

| High-Interest Debt / LAAV | Score | Example |
|---|---|---|
| 0% (no high-interest debt) | 100 | Clean — no credit card debt |
| 0–5% | 80 | $5k credit card on $100k LAAV |
| 5–15% | 55 | $12k credit card on $100k LAAV |
| 15–30% | 30 | $25k credit card on $100k LAAV |
| > 30% | 10 | Severely over-leveraged |

#### Sub-B: Debt-to-LAAV Score (35% of D6)

```
dtl_score = max(0, 100 − (total_debt / LAAV × 50))
```

| Total Debt / LAAV | Score |
|---|---|
| 0% (no debt) | 100 |
| 50% (debt = half of assets) | 75 |
| 100% (debt = assets) | 50 |
| 200% (debt doubles assets) | 0 |

**V1 default:** `total_debt = 0` → assumes debt-free → score = 100 if LAAV > 0.

#### Sub-C: Debt Trajectory (25% of D6)

**V1 default: 50 (neutral)** — requires 90-day debt history from Plaid (V2).

---

### D7 — Wealth Velocity

> **Weight:** 4–7% · **Confidence:** 75%

```
D7 = (Contribution Consistency × 0.40)
   + (Net Asset Trajectory     × 0.35)
   + (Ratio Improvement        × 0.25)
```

#### Sub-A: Contribution Consistency (40% of D7)

**V1 default: 50 (neutral)** — requires 12 months of transaction history (V2).

#### Sub-B: Net Asset Trajectory (35% of D7)

Uses the portfolio's weighted 24h change as a short-term proxy for growth vs the 7%/year benchmark.

```
benchmark_daily = 0.07 / 365 = 0.0192%
market_adj = portfolio_24h_change% − benchmark_daily%
trajectory = 50 + (market_adj × 400 × 365)
trajectory = clamp(trajectory, 25, 75)   ← capped because single-day data is noisy
```

| Portfolio 24h Change | Trajectory Score |
|---|---|
| −2% or worse | 25 (floor) |
| −0.5% | ~25–30 |
| 0% (flat) | ~43 |
| +0.019% (matches benchmark) | 50 |
| +0.5% | ~75 (ceiling) |
| +2% or better | 75 (ceiling) |

#### Sub-C: Ratio Improvement (25% of D7)

**V1 default: 50 (neutral)** — requires transaction history (V2).

---

## 7. Real User Examples

### Example 1 — Alex, 28, BTC Only on Coinbase

**Portfolio:** $50,000 BTC on Coinbase. No income/DOB set.

| Dimension | Score | Key Driver |
|---|---|---|
| D1 Liquidity | 62.5 | No expense data → neutral |
| D2 Investment | 49.2 | Pure crypto → deployment neutral (50); 1 asset class = 30 diversification |
| D4 Crypto | 61.2 | BTC = full blue-chip quality (60 pts); Coinbase = 85 custody; only 1 coin = 20 diversity |
| D6 Debt | 87.5 | No debt; BTC LAAV = $37,500 → D-t-L = 100 |
| D7 Velocity | 58.8 | Slight positive 24h movement |

**AFHS: 57** · Stage: Early · Label: **Fair**

**Why not higher?** D2 diversification = 30 (1 class only), D4 within-crypto diversity = 20 (1 coin).

**To improve:**
- Add ETH or SOL → D4 diversity: 20 → 40–60 (+3–5 pts)
- Buy $5k in AAPL or VTI → D2 deployment + diversification (+6–10 pts)
- Set date of birth → proper life-stage weights applied
- Set annual income → D1 expense estimation improves

---

### Example 2 — Maria, 35, Balanced Investor

**Portfolio:** $30k BTC + $20k ETH + $8k SOL (all Coinbase) + $10k AAPL + $5k USDC. Annual income: $80,000.

| Dimension | Score | Key Driver |
|---|---|---|
| D1 Liquidity | 60.1 | $5k USDC, est. expenses $4k/mo → 1.25 months covered vs 5-month target |
| D2 Investment | 68.5 | Non-crypto base = $15k; 10k equity = 67% deployed (80); 3 classes = 90 div; 1 equity = 20 concentration |
| D4 Crypto | 66.0 | BTC+ETH = 68% blue-chip; 3 coins = 60 diversity; Coinbase custody = 85; crypto = 79% of portfolio → concentration penalty |
| D6 Debt | 87.5 | No debt; strong LAAV |
| D7 Velocity | 58.8 | Slight positive movement |

**AFHS: 63** · Stage: Mid · Label: **Good**

**To improve:**
- Add $15k cash savings → D1 jumps to ~85 (covers 5-month target) (+6–8 pts)
- Add a second equity position (e.g. MSFT) → D2 concentration: 20 → 100 (+4–6 pts)
- Rebalance: crypto is 79% of portfolio (above 40% ceiling for mid-career) → reduce to 40% → D4 concentration score improves significantly (+4–8 pts)

---

### Example 3 — David, 58, Pre-Retirement

**Portfolio:** $200k AAPL + $30k BTC (Coinbase) + $20k USDC. Annual income: $150,000.

| Dimension | Score | Key Driver |
|---|---|---|
| D1 Liquidity | 67.1 | $20k USDC, est. expenses $7.5k/mo → 2.7 months vs 8-month target |
| D2 Investment | 76.5 | $220k non-crypto, $200k in equity = 91% deployed; 3 classes = 90 div; AAPL is only stock = concentration 20 |
| D4 Crypto | 82.5 | BTC only = 100% blue-chip quality; Coinbase custody = 85; crypto is 12% of portfolio (at 18% target) = good concentration |
| D6 Debt | 87.5 | No debt |
| D7 Velocity | 58.8 | Neutral |

**AFHS: 70** · Stage: Pre-Retirement · Label: **Good**

**To improve:**
- Add $40k to emergency fund → D1: 67 → ~88 (needs 8 months at this age) (+8–12 pts)
- Diversify equity beyond AAPL → D2 concentration: 20 → 75–100 (+4–8 pts)
- Both changes together could push score to **82–85**

---

### Example 4 — Sam, 25, Meme Coin Trader

**Portfolio:** $20k DOGE + $15k SHIB. Both on Binance.com.

| Dimension | Score | Key Driver |
|---|---|---|
| D1 Liquidity | 62.5 | No expense data → neutral |
| D2 Investment | 49.2 | Pure crypto → deployment neutral; 1 asset class = 30 |
| D4 Crypto | 21.7 | 100% meme coins = quality score 0; Binance.com = 30 custody; extreme volatility |
| D6 Debt | 87.5 | No known debt |
| D7 Velocity | 41.2 | Negative 24h movement (−5%, −3%) |

**AFHS: 46** · Stage: Early · Label: **Poor** · Risk: **Extreme**

**To improve:**
- Swap DOGE/SHIB to BTC/ETH → D4 quality: 0 → 60 (+12–18 pts)
- Move to Coinbase from Binance → D4 custody: 30 → 85 (+4–6 pts)
- Add any equity position → D2 (+6–10 pts)

---

### Example 5 — Ideal Portfolio, 30yo

**Portfolio:** $20k BTC + $15k ETH (Coinbase) + $20k AAPL + $15k MSFT (equity) + $10k USDC. Annual income: $90,000.

| Dimension | Score | Key Driver |
|---|---|---|
| D1 Liquidity | 87.5 | $10k USDC, $4.5k/mo expenses → 2.2 months; stablecoin quality = 100 |
| D2 Investment | 80.1 | Non-crypto base $45k, $35k equity = 78% deployed; 3 classes = 90 div; largest equity (AAPL $20k / $35k = 57%) = 45 concentration |
| D4 Crypto | 76.1 | BTC+ETH = 100% blue-chip; 2 coins = 40 diversity; crypto = 44% of portfolio (above 35% target) → moderate concentration penalty |
| D6 Debt | 87.5 | No debt; strong LAAV |
| D7 Velocity | 58.8 | Neutral |

**AFHS: 73** · Stage: Early · Label: **Good**

**To further improve:**
- Reduce crypto to 35% of portfolio (target) → D4 concentration improves
- Add third equity position → D2 concentration improves
- Increase cash to $13.5k (covers 3-month target exactly) → D1: 87 → 100

---

## 8. Score Improvement Cheat Sheet

### High Impact Actions

| Action | Dimensions Affected | Typical Gain |
|---|---|---|
| Set **date of birth** in Profile | All (enables accurate life-stage weights) | 1–5 pts |
| Set **annual income** in Profile | D1 (expense estimation works) | 2–8 pts |
| **Build emergency fund**: enough cash/USDC to cover your target months | D1 | 5–15 pts |
| **Buy any equity** (even one ETF like VTI) if you have cash sitting idle | D2 deployment | 5–12 pts |
| **Add a second equity position** (avoid single-stock concentration) | D2 concentration | 3–8 pts |
| **Hold 3 asset classes**: crypto + equity + stablecoins | D2 diversification | 5–10 pts |
| **Move from Binance.com to Coinbase/Kraken/Gemini** | D4 custody | 3–7 pts |
| **Add ETH or SOL alongside BTC** | D4 within-crypto diversity | 3–6 pts |
| **Reduce meme coin exposure** (DOGE, SHIB, PEPE) | D4 asset quality | 5–20 pts |
| **Use USDC instead of USDT or FRAX** for stablecoins | D1 stablecoin quality | 1–3 pts |
| **Rebalance crypto to life-stage target** (e.g. ≤35% for 20s–30s) | D4 concentration | 2–10 pts |

### Medium Impact Actions (V2)

| Action | Dimensions Affected | Typical Gain |
|---|---|---|
| Connect **Plaid checking account** | D1 (real expenses), D7 (contribution history) | 5–15 pts |
| Connect **Plaid liabilities** (credit cards, loans) | D6 (real debt scoring, not assumed debt-free) | ±10–20 pts |
| Connect **Plaid retirement account** (401k, IRA) | D3 (new dimension activates) | 5–10 pts |
| Connect **on-chain wallet** | D5 DeFi (new dimension activates) | 3–8 pts |

### Score Progression Example

Starting: Alex (28, BTC only, no profile) → **57**

| Step | Change | New Score |
|---|---|---|
| + Set DOB (age 28) | Life-stage weights accurate | 57 |
| + Set income ($70k) | D1 expense estimation enabled | 59 |
| + Add $6k USDC | D1: cash reserve improves | 63 |
| + Buy $5k VTI | D2: deployment + diversification | 68 |
| + Add ETH ($5k) | D4: within-crypto diversity | 70 |
| + Add second equity ($3k MSFT) | D2 concentration fixed | 74 |
| + Move from Binance to Coinbase | D4 custody | 77 |

---

## 9. API Response Shape

```
GET /api/portfolio/health
Authorization: Bearer <token>
```

```json
{
  "overall_score": 63,
  "overall_label": "Good",
  "overall_color": "text-green-400",
  "completeness_pct": 93,
  "active_dimensions": 6,
  "life_stage": "mid",
  "solvency_tier": "solvent",
  "metrics": {
    "diversification": {
      "score": 75.0,
      "label": "Good",
      "color": "text-green-400"
    },
    "risk_exposure": {
      "score": 62.5,
      "label": "Moderate",
      "color": "text-amber-400"
    },
    "performance": {
      "score": 58.8,
      "label": "Moderate",
      "color": "text-amber-400"
    }
  },
  "dimension_scores": {
    "d1_liquidity": 60.1,
    "d2_investment": 68.5,
    "d3_retirement": 54.3,
    "d4_crypto": 66.0,
    "d6_debt": 87.5,
    "d7_velocity": 58.8
  },
  "breakdown": {
    "d1": {
      "cash_reserve_score": 52.4,
      "stablecoin_quality_score": 100.0,
      "buffer_trend_score": 50.0,
      "months_covered": 1.25
    },
    "d2": {
      "deployment_rate_score": 80.0,
      "diversification_score": 90.0,
      "concentration_score": 20.0,
      "asset_classes_present": ["equity", "crypto", "cash_equivalent"]
    },
    "d3": {
      "accumulation_score": 42.0,
      "contribution_score": 50.0,
      "allocation_score": 100.0,
      "adjusted_balance": 18000.0,
      "benchmark": 120000.0,
      "graduation_factor": 0.60,
      "target_multiple": 1.5,
      "equity_target_pct": 75.0,
      "equity_actual_pct": 100.0
    },
    "d4": {
      "asset_quality_score": 60.0,
      "concentration_score": 48.2,
      "custody_score": 85.0,
      "diversification_score": 60.0,
      "volatility_score": 72.0,
      "btc_eth_pct": 68.0,
      "large_cap_pct": 92.1,
      "meme_pct": 0.0,
      "crypto_concentration_pct": 79.4
    },
    "d6": {
      "high_interest_debt_score": 100.0,
      "debt_to_liquid_score": 100.0,
      "debt_trajectory_score": 50.0
    },
    "d7": {
      "consistency_score": 50.0,
      "trajectory_score": 58.8,
      "ratio_improvement_score": 50.0
    }
  }
}
```

**Label and Color Reference:**

| Score Range | Label | Color Class |
|---|---|---|
| 80–100 | Excellent | `text-green-400` |
| 65–79 | Good | `text-green-400` |
| 45–64 | Fair | `text-amber-400` |
| 0–44 | Poor | `text-red-400` |

**Maximum score in V1: ~93** (completeness scalar = 0.931 with 5 active dimensions)

---

## 10. Known Limitations in V2

| Limitation | Impact | Fix in V3 |
|---|---|---|
| D6 assumes debt-free | Users with real debt score as if debt-free (too generous) | Plaid liabilities API |
| D1 uses income estimate (60%) instead of real expenses | Cash reserve score is an approximation | Plaid transaction data |
| D7 uses 24h change instead of contribution history | Wealth velocity is noisy and market-driven | 12-month transaction history |
| D3 uses equity-as-proxy for retirement balance | 401k/IRA vs brokerage not distinguished; contribution rate neutral (50) | Plaid retirement account connection |
| D5 needs wallet_address set by user | No UI to input wallet address — D5 never activates without it | Add wallet field to profile form |
| D5 APY data may be missing from Moralis | Positions without APY default to "safe" tier (optimistic) | Store or fetch APY separately |
| No SSM (Structural Solvency Multiplier) | Portfolios where debt > LAAV don't get penalized | Activate when D6 has real data |
| Volatility uses 24h change as proxy | Not as accurate as 30-day EWMA | Store historical prices |
| Score history needs repeat visits to populate | Chart is empty until user hits health endpoint multiple times | Schedule background score computation |
| Default age = 30 if no DOB set | Weights may not match user's actual life stage | User sets DOB in Profile |

---

---

## 11. Score History

Every call to `GET /api/portfolio/health` automatically saves a snapshot to `afhs_scores` (deduplicated to once per 15 minutes per user).

```
GET /api/portfolio/health/history?days=90
Authorization: Bearer <token>
```

```json
{
  "days": 90,
  "data": [
    {
      "computed_at": "2026-03-24T12:00:00+00:00",
      "overall_score": 63,
      "d1_liquidity": 60.1,
      "d2_investment": 68.5,
      "d3_retirement": 54.3,
      "d4_crypto": 66.0,
      "d5_defi": null,
      "d6_debt": 87.5,
      "d7_velocity": 58.8,
      "life_stage": "mid",
      "solvency_tier": "solvent"
    }
  ]
}
```

The `ScoreHistoryChart` frontend component auto-fetches this endpoint with a 30D/90D/1Y toggle.

---

*Built by Altrion Engineering · AFHS V2 · Reference spec: AFHS Engineering Document v2 (35 pages)*
