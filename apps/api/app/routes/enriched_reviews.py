from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import select, text

from apps.api.app.db import get_db
from apps.api.app.models import ReviewEnriched

router = APIRouter()

@router.get("/reviews")
def list_enriched_reviews(
    vertical: Optional[str] = None,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),

    # NEW: drilldown filters (optional)
    aspect: Optional[str] = None,
    stakeholder: Optional[str] = None,
    sentiment: Optional[str] = None,  # Positive | Neutral | Negative

    db: Session = Depends(get_db),
):
    stmt = (
        select(ReviewEnriched)
        .order_by(ReviewEnriched.created_at.desc())
        .limit(limit)
        .offset(offset)
    )

    if vertical:
        stmt = stmt.where(ReviewEnriched.vertical == vertical)

    # Apply EXISTS filter only if any drilldown filter is provided
    if aspect or stakeholder or sentiment:
        stmt = stmt.where(
            text(
                """
                EXISTS (
                  SELECT 1
                  FROM jsonb_array_elements(reviews_enriched.aspects_json->'mentioned_aspects') AS elem
                  WHERE (:aspect IS NULL OR elem->>'aspect' = :aspect)
                    AND (:stakeholder IS NULL OR elem->>'stakeholder' = :stakeholder)
                    AND (:sentiment IS NULL OR elem->>'sentiment' = :sentiment)
                )
                """
            ).bindparams(
                aspect=aspect,
                stakeholder=stakeholder,
                sentiment=sentiment,
            )
        )

    rows = db.execute(stmt).scalars().all()

    return {
        "count": len(rows),
        "filters": {
            "vertical": vertical,
            "limit": limit,
            "offset": offset,
            "aspect": aspect,
            "stakeholder": stakeholder,
            "sentiment": sentiment,
        },
        "items": [
            {
                "id": str(r.id),
                "raw_id": str(r.raw_id),
                "source": r.source,
                "source_review_id": r.source_review_id,
                "vertical": r.vertical,
                "created_at": r.created_at.isoformat(),
                "analyzed_at": r.analyzed_at.isoformat(),
                "overall_sentiment": r.overall_sentiment,
                "aspects_json": r.aspects_json,
                "stakeholder_flags_json": r.stakeholder_flags_json,
                "model_version": r.model_version,
                "prompt_version": r.prompt_version,
            }
            for r in rows
        ],
    }
