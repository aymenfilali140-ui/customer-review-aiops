from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text

from apps.api.app.db import get_db

router = APIRouter()


@router.get("/options/aspects")
def list_aspects(
    vertical: Optional[str] = Query(None),
    days: int = Query(0, ge=0, le=3650),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Returns distinct aspects seen in reviews_enriched.aspects_json->mentioned_aspects,
    optionally filtered by vertical and time window.

    days=0 means "all time" (no cutoff).
    """
    since = None
    if days and days > 0:
        since = datetime.now(timezone.utc) - timedelta(days=days)

    sql = """
    WITH m AS (
      SELECT
        (elem->>'aspect') AS aspect
      FROM reviews_enriched re,
      LATERAL jsonb_array_elements(re.aspects_json->'mentioned_aspects') AS elem
      WHERE (:vertical IS NULL OR re.vertical = :vertical)
        AND (:since IS NULL OR re.created_at >= :since)
        AND (elem->>'aspect') IS NOT NULL
    )
    SELECT aspect, COUNT(*) AS n
    FROM m
    GROUP BY aspect
    ORDER BY n DESC, aspect ASC
    """

    rows = db.execute(
        text(sql),
        {"vertical": vertical, "since": since},
    ).mappings().all()

    items: List[Dict[str, Any]] = [{"aspect": r["aspect"], "count": int(r["n"])} for r in rows]

    return {
        "filters": {"vertical": vertical, "days": days},
        "items": items,
    }
