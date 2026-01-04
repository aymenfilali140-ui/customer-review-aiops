from datetime import datetime, timezone
from typing import Any, Dict, Optional


def _to_aware_utc(dt: Optional[datetime]) -> datetime:
    if dt is None:
        return datetime.now(timezone.utc)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def json_safe(value: Any) -> Any:
    """
    Recursively convert objects that are not JSON-serializable (notably datetime)
    into JSON-safe representations.
    """
    if isinstance(value, datetime):
        # ISO 8601 string
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc).isoformat()

    if isinstance(value, dict):
        return {k: json_safe(v) for k, v in value.items()}

    if isinstance(value, list):
        return [json_safe(v) for v in value]

    return value


def normalize_google_play_review(
    raw: Dict[str, Any],
    vertical: str,
    lang: str,
    country: str,
) -> Dict[str, Any]:
    created_at = _to_aware_utc(raw.get("at"))
    ingested_at = datetime.now(timezone.utc)

    raw_clean = json_safe(raw)

    return {
        "source": "google_play",
        "source_review_id": raw.get("reviewId"),
        "vertical": vertical,
        "created_at": created_at,
        "ingested_at": ingested_at,
        "rating": raw.get("score"),
        "language": lang,
        "original_text": (raw.get("content") or "").strip(),
        "raw_payload": raw_clean,
    }
