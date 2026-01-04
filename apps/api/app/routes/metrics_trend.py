from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Query
from sqlalchemy import case, func

from apps.api.app.db import SessionLocal
from apps.api.app.models import ReviewEnriched

router = APIRouter()


@router.get("/metrics/trend")
def metrics_trend(
    vertical: str = Query(...),
    days: int = Query(30, ge=0, le=3650),
    bucket: str = Query("day", pattern="^(day|week|month)$"),
):
    """
    Trend buckets by *review created_at* date (UTC).

    - days=0 means "All time" (no cutoff filter)
    - bucket controls aggregation granularity:
        day   -> daily buckets
        week  -> weekly buckets
        month -> monthly buckets

    Response keeps the same shape:
      series: [{ day: "YYYY-MM-DD", total: int, negative: int }, ...]
    Where "day" is the bucket start date (UTC).
    """
    now = datetime.now(timezone.utc)
    cutoff = None if days == 0 else (now - timedelta(days=days))

    # Bucket by created_at in UTC, truncated to chosen granularity
    bucket_expr = func.date_trunc(bucket, func.timezone("UTC", ReviewEnriched.created_at)).label("bucket")

    with SessionLocal() as db:
        stmt = (
            db.query(
                bucket_expr,
                func.count(ReviewEnriched.id).label("total"),
                func.sum(
                    case(
                        (ReviewEnriched.overall_sentiment == "Negative", 1),
                        else_=0,
                    )
                ).label("negative"),
            )
            .filter(ReviewEnriched.vertical == vertical)
            .group_by(bucket_expr)
            .order_by(bucket_expr.asc())
        )

        if cutoff is not None:
            stmt = stmt.filter(ReviewEnriched.created_at >= cutoff)

        rows = stmt.all()

    # bucket_expr returns a timestamp (start of bucket). Convert to date string.
    series = [
        {
            "day": r.bucket.date().isoformat(),
            "total": int(r.total or 0),
            "negative": int(r.negative or 0),
        }
        for r in rows
    ]

    return {
        "filters": {"vertical": vertical, "days": days, "bucket": bucket},
        "series": series,
    }
