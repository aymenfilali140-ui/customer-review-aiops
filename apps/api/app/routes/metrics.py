from typing import Optional, Dict, Any
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text

from apps.api.app.db import get_db

router = APIRouter()


@router.get("/metrics/summary")
def metrics_summary(
    vertical: Optional[str] = Query(None),
    days: int = Query(30, ge=0, le=3650),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Summary metrics based on ENRICHED reviews.

    days=0 means "All time" (no cutoff filter).
    Note: this route currently filters on analyzed_at (not created_at),
    which is fine for MVP as long as you understand it’s analysis-window based.
    """
    now = datetime.now(timezone.utc)
    since = None if days == 0 else (now - timedelta(days=days))

    params = {"since": since, "vertical": vertical}

    # 1) Total + sentiment distribution
    sentiment_sql = """
    SELECT overall_sentiment, COUNT(*) AS n
    FROM reviews_enriched
    WHERE (:since IS NULL OR analyzed_at >= :since)
      AND (:vertical IS NULL OR vertical = :vertical)
    GROUP BY overall_sentiment
    """
    sentiment_rows = db.execute(text(sentiment_sql), params).mappings().all()
    sentiment = {r["overall_sentiment"]: int(r["n"]) for r in sentiment_rows}
    total = sum(sentiment.values())

    # 2) Top negative aspects
    top_aspects_sql = """
    WITH m AS (
      SELECT
        (elem->>'aspect') AS aspect,
        (elem->>'sentiment') AS sentiment
      FROM reviews_enriched re,
      LATERAL jsonb_array_elements(re.aspects_json->'mentioned_aspects') AS elem
      WHERE (:since IS NULL OR re.analyzed_at >= :since)
        AND (:vertical IS NULL OR re.vertical = :vertical)
    )
    SELECT aspect, COUNT(*) AS n
    FROM m
    WHERE aspect IS NOT NULL
      AND sentiment = 'Negative'
    GROUP BY aspect
    ORDER BY n DESC
    LIMIT 10
    """
    top_aspects = db.execute(text(top_aspects_sql), params).mappings().all()

    # 3) Stakeholder negative counts
    stakeholder_sql = """
    WITH s AS (
      SELECT
        key AS stakeholder,
        (value->>'Negative')::int AS negative_count
      FROM reviews_enriched re,
      LATERAL jsonb_each(re.stakeholder_flags_json) AS t(key, value)
      WHERE (:since IS NULL OR re.analyzed_at >= :since)
        AND (:vertical IS NULL OR re.vertical = :vertical)
    )
    SELECT stakeholder, SUM(negative_count) AS n
    FROM s
    GROUP BY stakeholder
    ORDER BY n DESC
    """
    stakeholder = db.execute(text(stakeholder_sql), params).mappings().all()

    return {
        "filters": {"vertical": vertical, "days": days},
        "total_reviews": total,
        "sentiment_distribution": sentiment,
        "top_negative_aspects": [{"aspect": r["aspect"], "count": int(r["n"])} for r in top_aspects],
        "stakeholder_negative_counts": [{"stakeholder": r["stakeholder"], "count": int(r["n"])} for r in stakeholder],
    }
