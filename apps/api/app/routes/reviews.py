from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import select
from apps.api.app.db import get_db
from apps.api.app.models import ReviewRaw
from typing import Optional, Any, Dict

router = APIRouter()

@router.get("/raw-reviews")
def list_raw_reviews(
    vertical: Optional[str] = None,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    stmt = select(ReviewRaw).order_by(ReviewRaw.created_at.desc()).limit(limit).offset(offset)
    if vertical:
        stmt = stmt.where(ReviewRaw.vertical == vertical)
    rows = db.execute(stmt).scalars().all()
    return {
        "count": len(rows),
        "items": [
            {
                "id": str(r.id),
                "source": r.source,
                "source_review_id": r.source_review_id,
                "vertical": r.vertical,
                "created_at": r.created_at.isoformat(),
                "ingested_at": r.ingested_at.isoformat(),
                "rating": r.rating,
                "language": r.language,
                "original_text": r.original_text,
            }
            for r in rows
        ],
    }
