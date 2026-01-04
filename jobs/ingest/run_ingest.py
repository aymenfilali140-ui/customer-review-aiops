import argparse
import os
from typing import Any, Dict

from sqlalchemy.dialects.postgresql import insert

from apps.api.app.db import SessionLocal, engine
from apps.api.app.models import Base, ReviewRaw
from jobs.ingest.sources.google_play import fetch_google_play_reviews
from jobs.ingest.normalize import normalize_google_play_review


def upsert_raw(db, row: Dict[str, Any]) -> bool:
    """
    Returns True if inserted, False if already existed.
    Uses ON CONFLICT DO NOTHING on (source, source_review_id).
    """
    stmt = (
        insert(ReviewRaw)
        .values(**row)
        .on_conflict_do_nothing(index_elements=["source", "source_review_id"])
    )
    res = db.execute(stmt)
    return res.rowcount == 1


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--vertical", required=True, help="e.g., groceries, food, laundry")
    parser.add_argument("--app-id", default=os.getenv("DEFAULT_APP_ID", "com.oryx.snoonu"))
    parser.add_argument("--country", default=os.getenv("DEFAULT_COUNTRY", "qa"))
    parser.add_argument("--lang", default=os.getenv("DEFAULT_LANG", "en"))
    parser.add_argument("--count", type=int, default=200, help="per page")
    parser.add_argument("--pages", type=int, default=2, help="max pages to fetch")
    args = parser.parse_args()

    # Ensure tables exist (safe to call repeatedly)
    Base.metadata.create_all(bind=engine)

    raw_reviews = fetch_google_play_reviews(
        app_id=args.app_id,
        lang=args.lang,
        country=args.country,
        count=args.count,
        max_pages=args.pages,
    )

    inserted = 0
    skipped = 0

    with SessionLocal() as db:
        for raw in raw_reviews:
            norm = normalize_google_play_review(raw, args.vertical, args.lang, args.country)

            if not norm["source_review_id"] or not norm["original_text"]:
                skipped += 1
                continue

            if upsert_raw(db, norm):
                inserted += 1

        db.commit()

    print(f"Fetched={len(raw_reviews)} InsertedNew={inserted} SkippedInvalid={skipped}")


if __name__ == "__main__":
    main()
