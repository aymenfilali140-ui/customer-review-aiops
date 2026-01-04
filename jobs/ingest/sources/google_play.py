from typing import Any, Dict, List, Optional, Tuple
from google_play_scraper import Sort, reviews


def fetch_google_play_reviews(
    app_id: str,
    lang: str,
    country: str,
    count: int = 200,
    max_pages: int = 3,
) -> List[Dict[str, Any]]:
    """
    Fetch up to (count * max_pages) newest reviews.
    google_play_scraper returns (result, continuation_token).
    """
    all_rows: List[Dict[str, Any]] = []
    token: Optional[Dict[str, Any]] = None

    for _ in range(max_pages):
        result, token = reviews(
            app_id,
            lang=lang,
            country=country,
            sort=Sort.NEWEST,
            count=count,
            continuation_token=token,
        )
        if not result:
            break

        all_rows.extend(result)

        if not token:
            break

    return all_rows
