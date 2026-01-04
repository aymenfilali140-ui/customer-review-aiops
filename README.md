# Customer Reviews AIOps (Snoonu Internal Prototype)

Customer Reviews AIOps is an internal prototype that turns raw customer review text into stakeholder-oriented insights. It includes:

* an ingestion + enrichment pipeline (`jobs/`)
* a metrics and review retrieval API (FastAPI, `apps/api/`)
* a dashboard for exploration and drill-down (Next.js, `apps/web/`)

The goal is to help teams quickly understand what’s driving negative feedback, which stakeholder it impacts, and what evidence supports each signal.

---

## What you can do in the dashboard

### Overview

A high-level view of the current state:

* KPIs (total / positive / neutral / negative)
* trend (with day/week/month bucketing)
* negative drivers (top negative aspects)
* stakeholder negatives
* drilldown into evidence-backed reviews

### Stakeholders

A stakeholder-specific view that tells a coherent story:

* trend for the selected stakeholder
* top drivers (aspects) affecting that stakeholder
* recommended actions prioritized by impact
* evidence available on demand (drawer/modal)

### Reviews

A dedicated, stable browsing view of enriched reviews:

* filter/search enriched reviews
* inspect extracted aspects and sentiment per review
* use as a “source of truth” independent of the overview drilldowns

---

## Architecture (high level)

1. **Ingestion** collects raw reviews into Postgres (`reviews_raw`)
2. **Enrichment** extracts aspects, assigns stakeholder flags, and computes sentiment (`reviews_enriched`)
3. **API** exposes metrics endpoints and enriched review retrieval
4. **Web dashboard** consumes the API and provides drilldowns + visualizations

---

## Repository structure

* `apps/api/` — FastAPI backend (routes, SQLAlchemy, models)
* `apps/web/` — Next.js dashboard (routes like `/overview`, `/stakeholders`, `/reviews`)
* `jobs/` — ingestion + enrichment pipeline scripts
* `packages/shared/` — shared config (e.g., verticals, aspects, stakeholder mappings)

---

## Prerequisites

* Python 3.10+ (3.11 recommended)
* Node.js 18+ (recommended for Next.js 14)
* Docker (recommended for local Postgres)
* (Optional) Ollama running locally if you use the local LLM enrichment path

---

## Configuration

Create a `.env` (or `.env.local` for web) with values like:

* Postgres: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URL`
* API: `API_HOST`, `API_PORT`
* Ingestion defaults: `DEFAULT_APP_ID`, `DEFAULT_COUNTRY`, `DEFAULT_LANG`
* Web: `NEXT_PUBLIC_API_BASE` (e.g., `http://127.0.0.1:8000`)

---

## Run locally

### 1) Start Postgres (Docker)

From repo root:

* `docker compose -f docker/docker-compose.yml up -d`
* Verify it’s healthy:

  * `docker compose -f docker/docker-compose.yml ps`

### 2) Backend API (FastAPI)

From repo root:

* Create and activate a virtual environment:

  * `python -m venv .venv`
  * `source .venv/bin/activate`

* Install dependencies (use the one that exists in your repo):

  * `pip install -r requirements.txt`
  * or `pip install -r apps/api/requirements.txt`

* Run the API:

  * `python -m uvicorn apps.api.app.main:app --host 127.0.0.1 --port 8000 --log-level info`

API should be reachable at:

* `http://127.0.0.1:8000`

### 3) Run ingestion + enrichment

From repo root (with `.venv` activated):

* Ingest a batch:

  * `python -m jobs.ingest.run_ingest --vertical groceries --pages 2 --count 200`

* Enrich/analyze:

  * `python -m jobs.analyze.analyzer`

This should populate:

* `reviews_raw` (raw ingested reviews)
* `reviews_enriched` (enriched + aspect/sentiment outputs)

### 4) Web dashboard (Next.js)

From `apps/web/`:

* Install dependencies:

  * `npm install`

* Run dev server:

  * `npm run dev`

Open:

* `http://localhost:3000`

---

## Notes and limitations (MVP)

* “Vertical” currently acts as the main segmentation key; it can later be replaced or complemented with app/product identifiers.
* Trend quality improves as the pipeline runs over time (more time points).
* Stakeholder/action narratives are intentionally MVP-grade and can be upgraded with stronger models, better prompts, and richer analytics.

---

## License / internal use

This repository is an internal Snoonu prototype intended for experimentation and iteration.
