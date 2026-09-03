# RecoverFlow AI — Final Submission Checklist

## Infrastructure

- [x] **Backend runs successfully** — `uvicorn app.main:app --reload` starts without errors on port 8000
- [x] **Frontend runs successfully** — `npm run dev` starts without errors on port 3000
- [x] **ML model loads** — `baseline_model_calibrated.pkl` loads correctly; ML-assisted decisions are produced
- [x] **Database connected** — SQLite `recoverflow.db` contains 5,200 checkout events; queries return correct data

## API Endpoints Tested

- [x] `GET /` → 200 OK — returns API health message
- [x] `GET /docs` → 200 OK — Swagger UI loads
- [x] `GET /openapi.json` → 200 OK — OpenAPI schema loads
- [x] `GET /checkouts/summary` → 200 OK — returns total_checkouts, revenue figures
- [x] `GET /recovery/baseline-summary` → 200 OK — returns eligible cases, action distribution, ML/rule split
- [x] `GET /recovery/decisions?limit=200` → 200 OK — returns 200 prioritised cases
- [x] `GET /recovery/decision/{checkout_id}` → 200 OK — returns full case detail with all fields

## Dashboard Tested

- [x] Dashboard loads without console errors
- [x] Total Checkouts stat card displays correct value (5,200)
- [x] Eligible Recovery Cases stat card displays correct value (771)
- [x] Revenue at Risk stat card displays correct value
- [x] Expected Recoverable stat card displays correct value
- [x] Revenue Funnel displays correctly with all three stages
- [x] Recovery Action Distribution chart (Recharts) renders without SSR errors
- [x] Key Metrics panel shows all 5 metrics
- [x] Decision Engine breakdown (Rule-Based + ML-Assisted) shows correct counts
- [x] Recovery Probability Distribution histogram renders correctly
- [x] Loading skeletons display while data fetches
- [x] Error states display if backend is unreachable

## Recovery Queue Tested

- [x] Table renders 25 rows initially with "Load more" pagination
- [x] Search by Checkout ID filters correctly
- [x] Status filter (Failed / Abandoned) works correctly
- [x] Action filter (Send Reminder / Retry Payment / etc.) works correctly
- [x] Priority filter (All / High / Medium / Low) works correctly
- [x] Reset button clears all filters simultaneously
- [x] Sort by Order Value works (ascending + descending)
- [x] Sort by Recovery % works (ascending + descending)
- [x] Sort by Expected Revenue works (ascending + descending)
- [x] Empty state displays when filters produce no results
- [x] Clicking a row navigates to correct Recovery Case detail page

## Case Detail Page Tested

- [x] Loading skeleton displays while case data fetches
- [x] Error state displays for invalid/missing checkout IDs (404)
- [x] All 4 key metric cards render (Expected Recovery, Recovery Probability, Order Value, Priority)
- [x] Recommended Action card displays action name, icon, description
- [x] Recovery Probability progress bar renders correctly
- [x] Decision Confidence progress bar renders correctly
- [x] ML Assisted / Rule Based badges render correctly
- [x] Session Information panel shows all fields (Checkout ID, Status, Segment, Failure Reason, Method, Attempts, Prior Failures, Past Orders, Decision Engine)
- [x] "Why RecoverFlow Prioritised This Case" explanation panel renders
- [x] Priority Rationale sub-panel renders with correct colour coding
- [x] Decision Factors grid renders positive/negative factors
- [x] Decision Engine Signals grid renders ML scores and rule signals
- [x] "← Back to Dashboard" navigation link works
- [x] Directly refreshing a `/recovery/{id}` URL loads correctly (no hydration errors)

## Data Consistency Verified

- [x] `total_revenue_at_risk` matches between `/checkouts/summary` and `/recovery/baseline-summary`
- [x] `total_eligible_cases` in baseline-summary matches count of rows returned by `/recovery/decisions`
- [x] `expected_recoverable_revenue` per case = `cart_value × estimated_recovery_probability` (within rounding)
- [x] Dashboard "Rule-Based" count correctly combines `rule_based + fallback` from `source_distribution`
- [x] Priority tier (High ≥ $500, Medium ≥ $200, Low < $200) is consistent between table and detail page

## Documentation

- [x] **README.md** — complete with all 13 required sections
- [x] **SUBMISSION_CHECKLIST.md** — this file

## Submission Readiness

- [x] No TypeScript/build errors (`npm run build` exits 0)
- [x] No broken imports or missing components
- [x] No hardcoded secrets or API keys in code
- [x] `.gitignore` present (node_modules, .next, .venv, __pycache__)
- [ ] Screenshots added to `screenshots/` directory ← add before submitting
- [ ] Final git commit and push to submission repository

## How to Run

### Backend
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
# → http://127.0.0.1:8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
# → http://localhost:3000
```
