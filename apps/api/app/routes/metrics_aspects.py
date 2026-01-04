from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text

from apps.api.app.db import get_db

router = APIRouter()


@router.get("/metrics/aspects")
def metrics_aspects(
    vertical: Optional[str] = Query(None),
    days: int = Query(30, ge=0, le=3650),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Aspect metrics based on ENRICHED reviews.

    days=0 means "All time" (no cutoff filter).
    Note: this route filters on analyzed_at in SQL (analysis-window based).
    """
    now = datetime.now(timezone.utc)
    since = None if days == 0 else (now - timedelta(days=days))

    params = {"since": since, "vertical": vertical}

    # Explode mentioned_aspects[] and aggregate by stakeholder/aspect/sentiment
    sql = """
    WITH m AS (
      SELECT
        re.vertical AS vertical,
        (elem->>'stakeholder') AS stakeholder,
        (elem->>'aspect') AS aspect,
        (elem->>'sentiment') AS sentiment
      FROM reviews_enriched re,
      LATERAL jsonb_array_elements(re.aspects_json->'mentioned_aspects') AS elem
      WHERE (:since IS NULL OR re.analyzed_at >= :since)
        AND (:vertical IS NULL OR re.vertical = :vertical)
    )
    SELECT
      stakeholder,
      aspect,
      sentiment,
      COUNT(*) AS n
    FROM m
    WHERE aspect IS NOT NULL
      AND stakeholder IS NOT NULL
      AND sentiment IS NOT NULL
    GROUP BY stakeholder, aspect, sentiment
    ORDER BY n DESC;
    """

    rows = db.execute(text(sql), params).mappings().all()

    aspect_totals: Dict[str, int] = {}
    stakeholder_totals: Dict[str, int] = {}

    items: List[Dict[str, Any]] = []
    for r in rows:
        stakeholder = r["stakeholder"]
        aspect = r["aspect"]
        sentiment = r["sentiment"]
        n = int(r["n"])

        items.append(
            {
                "stakeholder": stakeholder,
                "aspect": aspect,
                "sentiment": sentiment,
                "count": n,
            }
        )

        aspect_totals[aspect] = aspect_totals.get(aspect, 0) + n
        stakeholder_totals[stakeholder] = stakeholder_totals.get(stakeholder, 0) + n

    return {
        "filters": {"vertical": vertical, "days": days},
        "items": items,
        "aspect_totals": [
            {"aspect": k, "count": v}
            for k, v in sorted(aspect_totals.items(), key=lambda x: x[1], reverse=True)
        ],
        "stakeholder_totals": [
            {"stakeholder": k, "count": v}
            for k, v in sorted(stakeholder_totals.items(), key=lambda x: x[1], reverse=True)
        ],
    }
