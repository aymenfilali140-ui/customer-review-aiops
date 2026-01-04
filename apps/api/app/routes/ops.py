from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter
from sqlalchemy import func, text

from apps.api.app.db import SessionLocal
from apps.api.app.models import ReviewRaw, ReviewEnriched

router = APIRouter()


@router.get("/ops/health")
def ops_health() -> Dict[str, Any]:
    """
    Basic liveness + DB connectivity.
    """
    with SessionLocal() as db:
        db.execute(text("SELECT 1"))
    return {
        "status": "ok",
        "time_utc": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/ops/stats")
def ops_stats() -> Dict[str, Any]:
    """
    Pipeline observability:
    - totals (raw/enriched)
    - backlog (raw not yet enriched)
    - freshness (max ingested_at / analyzed_at)
    - per-vertical breakdown
    """
    with SessionLocal() as db:
        raw_total = int(db.query(func.count(ReviewRaw.id)).scalar() or 0)
        enriched_total = int(db.query(func.count(ReviewEnriched.id)).scalar() or 0)

        # backlog: raw rows that don't have an enriched row yet
        backlog = (
            db.query(func.count(ReviewRaw.id))
            .outerjoin(ReviewEnriched, ReviewEnriched.raw_id == ReviewRaw.id)
            .filter(ReviewEnriched.raw_id.is_(None))
            .scalar()
        )
        backlog_total = int(backlog or 0)

        last_ingested_at = db.query(func.max(ReviewRaw.ingested_at)).scalar()
        last_analyzed_at = db.query(func.max(ReviewEnriched.analyzed_at)).scalar()

        # per-vertical breakdown
        raw_by_vertical = db.query(ReviewRaw.vertical, func.count(ReviewRaw.id)).group_by(ReviewRaw.vertical).all()
        enriched_by_vertical = db.query(ReviewEnriched.vertical, func.count(ReviewEnriched.id)).group_by(ReviewEnriched.vertical).all()

        raw_map = {r[0]: int(r[1]) for r in raw_by_vertical if r[0]}
        enriched_map = {r[0]: int(r[1]) for r in enriched_by_vertical if r[0]}

        # backlog by vertical
        backlog_by_vertical = (
            db.query(ReviewRaw.vertical, func.count(ReviewRaw.id))
            .outerjoin(ReviewEnriched, ReviewEnriched.raw_id == ReviewRaw.id)
            .filter(ReviewEnriched.raw_id.is_(None))
            .group_by(ReviewRaw.vertical)
            .all()
        )
        backlog_map = {r[0]: int(r[1]) for r in backlog_by_vertical if r[0]}

    return {
        "time_utc": datetime.now(timezone.utc).isoformat(),
        "totals": {
            "raw": raw_total,
            "enriched": enriched_total,
            "unenriched_backlog": backlog_total,
        },
        "freshness": {
            "last_ingested_at": last_ingested_at.isoformat() if last_ingested_at else None,
            "last_analyzed_at": last_analyzed_at.isoformat() if last_analyzed_at else None,
        },
        "by_vertical": {
            "raw": raw_map,
            "enriched": enriched_map,
            "backlog": backlog_map,
        },
    }
