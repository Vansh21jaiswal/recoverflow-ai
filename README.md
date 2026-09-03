# RecoverFlow AI

> **AI-powered checkout recovery intelligence** — identify failed and abandoned checkouts, predict recovery probability, and recommend the best action to recover lost revenue.

---

## Problem Statement

Ecommerce merchants lose significant revenue every day to two specific failure modes:

1. **Abandoned checkouts** — customers who reach the payment screen but leave without completing the transaction.
2. **Failed payments** — customers who attempt to pay but encounter errors (gateway timeouts, card declines, UPI failures).

Traditional recovery approaches (blanket cart-abandonment emails, manual review) are slow, untargeted, and often counterproductive. A high-value customer who left due to a temporary bank timeout does not need a discount reminder — they need an automatic payment retry.

**RecoverFlow AI** solves this by running each failed or abandoned checkout through an intelligent decision engine that selects the right recovery action, for the right customer, at the right time.

---

## Solution Overview

RecoverFlow AI ingests checkout event data and produces a prioritised recovery queue. For every eligible checkout, it:

1. Runs a **policy check** — applies hard business rules (fraud blocks, compliance holds, known failure patterns).
2. Scores candidate actions using a **calibrated ML model** trained on historical checkout outcomes.
3. Selects the action that maximises expected recoverable revenue, respecting all policy constraints.
4. Computes a **recovery probability** and **expected recoverable revenue** for each case.
5. Presents all decisions in a real-time dashboard with full AI explainability.

---

## Key Features

| Feature | Description |
|---|---|
| **Recovery Queue** | Prioritised list of all eligible cases, sortable by order value, probability, and expected revenue |
| **Priority Tiers** | Automatic High / Medium / Low classification based on expected recoverable revenue |
| **Hybrid Decision Engine** | Rule-based policy + ML-assisted scoring — best of both approaches |
| **Explainable AI** | Every recommendation includes decision factors, signals, and a plain-English rationale |
| **Revenue Funnel** | Visual breakdown from total processed revenue → at-risk → expected recovery |
| **Recovery Probability Distribution** | Histogram of recovery probabilities across all queued cases |
| **Decision Engine Breakdown** | Rule-based vs ML-assisted split visible on the dashboard |
| **Case Detail View** | Full per-case analysis: action, confidence, factors, signals, priority rationale |
| **Filters & Search** | Filter by status, priority, action type; search by checkout ID |
| **Sorting** | Sort queue by order value, recovery probability, or expected revenue |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (Next.js)                     │
│  pages/index.tsx      — Landing page                        │
│  pages/dashboard.tsx  — Recovery dashboard                  │
│  pages/recovery/[id]  — Individual case detail              │
│  components/          — Layout, Table, Insights, Badges     │
│  lib/api.ts           — Proxy-based API client              │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP via /api/proxy (Next.js route)
┌────────────────────────▼────────────────────────────────────┐
│                     Backend (FastAPI)                        │
│  app/api/checkouts.py   — Checkout summary endpoint         │
│  app/api/recovery.py    — Recovery decisions & summary      │
│  app/services/          — Recovery engine + ML scorer       │
│  app/models/            — SQLAlchemy ORM models             │
│  app/schemas/           — Pydantic response schemas         │
└────────────────────────┬────────────────────────────────────┘
                         │ SQLAlchemy
┌────────────────────────▼────────────────────────────────────┐
│                   Database (SQLite)                          │
│  recoverflow.db  — 5,200 synthetic checkout events          │
│  models/artifacts/baseline_model_calibrated.pkl             │
└─────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 13, React, TypeScript, Tailwind CSS |
| Charts | Recharts (dynamically imported, SSR-disabled) |
| Backend | FastAPI 0.95, Python 3.9 |
| ORM | SQLAlchemy 1.4 |
| Validation | Pydantic 1.10 |
| Database | SQLite |
| ML | scikit-learn 1.6, pandas, joblib |
| Concurrency | Python `concurrent.futures.ThreadPoolExecutor` |

---

## How the AI / Decision Engine Works

The decision engine (`app/services/recovery_engine.py`) runs every eligible checkout through a two-stage pipeline:

### Stage 1 — Rule-Based Policy (`_policy_for_checkout`)

Deterministic rules that enforce business and compliance constraints. These **cannot be overridden by ML**:

| Condition | Action |
|---|---|
| `failure_reason` in `{suspected_fraud, compliance_hold}` | `human_review` (locked) |
| Temporary timeout (`bank_timeout`, `upi_timeout`, `gateway_timeout`) + first attempt | `retry_payment` |
| Temporary timeout + multiple attempts | `switch_payment_method` |
| ≥2 prior failed payments or ≥3 attempts | `switch_payment_method` |
| Abandoned + high-value cart (≥₹5,000) + premium customer + low risk | `offer_small_incentive` |
| Abandoned + high-value cart + elevated risk | `human_review` (locked) |
| General abandonment | `send_reminder` |
| Default failed checkout | `retry_payment` |

### Stage 2 — ML Scoring (`app/services/ml_scorer.py`)

A calibrated scikit-learn pipeline (`baseline_model_calibrated.pkl`) scores each **policy-safe candidate action** and selects the one with the highest predicted success probability — but only if it beats the rule engine's pick by a margin of >2% (`ML_RANK_MARGIN = 0.02`).

**Features used:**
`payment_status`, `failure_reason`, `attempt_count`, `previous_failed_payments`, `previous_successful_orders`, `cart_value`, `customer_segment`, `payment_method`, `time_on_checkout_seconds`, `risk_score`, `applied_recovery_action`

**Decision source labels:**
- `ml_assisted` — ML model was available and scored candidates
- `rule_based` — decision made entirely by deterministic policy

### Recovery Probability

After action selection, `estimate_probability()` computes a recovery probability based on base rates per action, adjusted for customer segment, purchase history, attempt count, and risk score. This is used to calculate **expected recoverable revenue = cart value × recovery probability**.

---

## Backend Setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The API will be available at **http://127.0.0.1:8000**

---

## Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The dashboard will be available at **http://localhost:3000**

---

## How to Generate / Load Data

The project ships with a pre-populated SQLite database (`backend/recoverflow.db`) containing **5,200 synthetic checkout events** and a trained ML model artifact (`backend/models/artifacts/baseline_model_calibrated.pkl`).

To regenerate data from scratch:

```bash
cd backend
source .venv/bin/activate
python3 generate_data.py       # Generates synthetic checkout events
python3 export_dataset.py      # Exports dataset for ML training
```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | API health check |
| `GET` | `/docs` | Interactive Swagger UI |
| `GET` | `/openapi.json` | OpenAPI schema |
| `GET` | `/checkouts/summary` | Checkout funnel metrics (totals, revenue) |
| `GET` | `/recovery/baseline-summary` | Aggregated recovery stats, action distribution, ML/rule split |
| `GET` | `/recovery/decisions?limit=N` | Paginated list of prioritised recovery decisions |
| `GET` | `/recovery/decision/{checkout_id}` | Full details for a single recovery case |

---

## Demo Walkthrough

1. Open **http://localhost:3000** — landing page.
2. Click **"View Recovery Dashboard"** → http://localhost:3000/dashboard.
3. Observe the **Revenue Funnel** and **Recovery Action Distribution** chart.
4. Check the **Key Metrics** panel — note the Decision Engine split (Rule-Based vs ML-Assisted).
5. In the **Recovery Queue**, sort by **Expected ↓** to see the highest-value cases first.
6. Filter by **High** priority to focus on cases with expected recovery ≥ $500.
7. Click any row to open the **Case Detail** view.
8. Review the **Recommended Recovery Action**, **Recovery Probability**, **Decision Confidence**, **Decision Factors**, and **Decision Engine Signals**.
9. Click **← Back to Dashboard** to return.

---

## Screenshots

> Add screenshots here before final submission.

| Screen | Description |
|---|---|
| `screenshots/dashboard.png` | Main recovery dashboard |
| `screenshots/recovery-queue.png` | Filtered recovery queue |
| `screenshots/case-detail.png` | Individual case with AI explanation |

---

## Known Limitations

- **Synthetic data only** — the database contains generated checkout events, not real merchant data.
- **INR currency** — the dataset was generated with Indian Rupee (INR) values; the `$` symbol in the UI is cosmetic for demonstration purposes.
- **SQLite** — suitable for prototyping; production would use PostgreSQL.
- **No authentication** — no user login or API key protection.
- **No real-time ingestion** — new checkout events cannot be pushed live; the DB is static.

---

## Future Improvements

- [ ] Webhook endpoint to ingest live checkout events
- [ ] Real-time notification when new high-priority cases are queued
- [ ] Action execution integration (trigger actual email/SMS/payment retry via external APIs)
- [ ] Multi-merchant support with tenant isolation
- [ ] A/B testing framework to measure actual recovery rates per action
- [ ] Retraining pipeline triggered when new labelled outcomes are available
- [ ] Export recovery queue to CSV
- [ ] PostgreSQL + Redis for production-scale deployment
