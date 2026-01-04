from typing import Optional, Any
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import select
from apps.api.app.db import get_db
from apps.api.app.models import ReviewEnriched

router = APIRouter()

def _norm(x: Optional[str]) -> Optional[str]:
    if x is None:
        return None
    x = str(x).strip().lower()
    return x or None

def _match_filters(aspects_json: Any, aspect: Optional[str], stakeholder: Optional[str], sentiment: Optional[str]) -> bool:
    want_aspect = _norm(aspect)
    want_stakeholder = _norm(stakeholder)
    want_sentiment = _norm(sentiment)

    if not want_aspect and not want_stakeholder and not want_sentiment:
        return True

    if not isinstance(aspects_json, dict):
        return False

    mentioned = aspects_json.get("mentioned_aspects") or []
    if not isinstance(mentioned, list):
        return False

    for m in mentioned:
        if not isinstance(m, dict):
            continue
        got_aspect = _norm(m.get("aspect"))
        got_stakeholder = _norm(m.get("stakeholder"))
        got_sentiment = _norm(m.get("sentiment"))

        if want_aspect and got_aspect != want_aspect:
            continue
        if want_stakeholder and got_stakeholder != want_stakeholder:
            continue
        if want_sentiment and got_sentiment != want_sentiment:
            continue

        return True

    return False

@router.get("/reviews", response_model=None)
def list_enriched_reviews(
    vertical: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    aspect: Optional[str] = Query(None),
    stakeholder: Optional[str] = Query(None),
    sentiment: Optional[str] = Query(None),  # Positive | Neutral | Negative (aspect-level in JSON)
    overall_sentiment: Optional[str] = Query(None),  # Optional: filter by ReviewEnriched.overall_sentiment
    db: Session = Depends(get_db),
):
    stmt = select(ReviewEnriched).order_by(ReviewEnriched.created_at.desc())

    if vertical:
        stmt = stmt.where(ReviewEnriched.vertical == vertical)

    if overall_sentiment:
        stmt = stmt.where(ReviewEnriched.overall_sentiment == overall_sentiment)

    rows = db.execute(stmt).scalars().all()

    # Python-side JSON filtering (SQLite-safe)
    filtered = [r for r in rows if _match_filters(r.aspects_json, aspect, stakeholder, sentiment)]

    total = len(filtered)
    page = filtered[offset : offset + limit]

    return {
        "count": total,
        "filters": {
            "vertical": vertical,
            "limit": limit,
            "offset": offset,
            "aspect": aspect,
            "stakeholder": stakeholder,
            "sentiment": sentiment,
            "overall_sentiment": overall_sentiment,
        },
        "items": [
            {
                "id": str(r.id),
                "raw_id": str(r.raw_id),
                "source": r.source,
                "source_review_id": r.source_review_id,
                "vertical": r.vertical,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "analyzed_at": r.analyzed_at.isoformat() if r.analyzed_at else None,
                "overall_sentiment": r.overall_sentiment,
                "aspects_json": r.aspects_json,
                "stakeholder_flags_json": r.stakeholder_flags_json,
                "model_version": r.model_version,
                "prompt_version": r.prompt_version,
            }
            for r in page
        ],
    }
