from datetime import datetime, timezone
from typing import Any, Dict, List

from pathlib import Path
import yaml

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from apps.api.app.db import SessionLocal, engine
from apps.api.app.models import Base, ReviewRaw, ReviewEnriched
from jobs.analyze.extraction_ollama import render_prompt, call_ollama_json
from jobs.analyze.sentiment_hf import SentimentClassifier


def load_vertical_config() -> Dict[str, Any]:
    path = Path("packages/shared/verticals.yml")
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def build_aspect_to_stakeholder(cfg: Dict[str, Any], vertical_key: str) -> Dict[str, str]:
    """
    Builds a mapping: aspect -> stakeholder.
    Safe if vertical_key is missing.
    """
    aspect_to_team: Dict[str, str] = {}

    global_stakeholders = cfg.get("global_stakeholders", {}) or {}
    for team, aspects in global_stakeholders.items():
        for a in (aspects or []):
            aspect_to_team[a] = team

    v = (cfg.get("verticals", {}) or {}).get(vertical_key, {}) or {}
    stakeholders = v.get("stakeholders", {}) or {}
    for team, aspects in stakeholders.items():
        for a in (aspects or []):
            aspect_to_team[a] = team

    return aspect_to_team


def select_unenriched_raw(db, limit: int = 50) -> List[ReviewRaw]:
    """
    Select raw rows not yet enriched (by raw_id).
    """
    subq = select(ReviewEnriched.raw_id)
    stmt = (
        select(ReviewRaw)
        .where(~ReviewRaw.id.in_(subq))
        .order_by(ReviewRaw.created_at.desc())
        .limit(limit)
    )
    return db.execute(stmt).scalars().all()


def insert_enriched(db, row: Dict[str, Any]) -> bool:
    """
    Insert enriched row; do nothing if it already exists by (source, source_review_id).
    """
    stmt = (
        insert(ReviewEnriched)
        .values(**row)
        .on_conflict_do_nothing(index_elements=["source", "source_review_id"])
    )
    res = db.execute(stmt)
    return res.rowcount == 1


def main(model: str = "mistral:7b-instruct", batch_size: int = 25) -> None:
    Base.metadata.create_all(bind=engine)

    cfg = load_vertical_config()
    sentiment = SentimentClassifier()
    template_path = Path("jobs/analyze/prompts/extraction.jinja")

    inserted = 0

    with SessionLocal() as db:
        raws = select_unenriched_raw(db, limit=batch_size)

        for r in raws:
            vertical_key = r.vertical

            v_cfg = (cfg.get("verticals", {}) or {}).get(vertical_key, {}) or {}

            # Build allowed aspects = global + vertical-specific
            allowed = list(cfg.get("global_aspects", []) or [])
            allowed.extend(v_cfg.get("aspects", []) or [])
            allowed = sorted(set(allowed))
            allowed_set = set(allowed)

            aspect_to_team = build_aspect_to_stakeholder(cfg, vertical_key)

            prompt = render_prompt(
                template_path,
                {
                    "vertical_key": vertical_key,
                    "allowed_aspects": allowed,
                    "aspect_to_stakeholder": aspect_to_team,
                    "text": r.original_text,
                },
            )

            print(f"Analyzing raw_id={r.id} vertical={r.vertical} chars={len(r.original_text)}")

            # Call Ollama (do not let one failure kill the batch)
            try:
                extraction = call_ollama_json(model=model, prompt=prompt)
            except Exception as e:
                print(f"[WARN] Ollama failed raw_id={r.id}: {e}")
                continue

            # Overall sentiment from the full review text
            try:
                overall_pred = sentiment.predict_labels([r.original_text])[0]
                overall_sentiment = overall_pred["label"]
            except Exception as e:
                print(f"[WARN] Sentiment failed raw_id={r.id}: {e}")
                overall_sentiment = "Neutral"

            # ---- Whitelist enforcement for aspects (hard guardrail) ----
            mentioned = extraction.get("mentioned_aspects", []) or []

            kept = []
            moved_to_unmapped = []
            for m in mentioned:
                asp = (m.get("aspect") or "").strip()
                if asp and asp in allowed_set:
                    kept.append(m)
                else:
                    moved_to_unmapped.append(
                        {
                            "issue": f"non_whitelisted_aspect:{asp}" if asp else "non_whitelisted_aspect:missing",
                            "evidence": (m.get("evidence") or "").strip(),
                            "confidence": float(m.get("confidence") or 0.0),
                        }
                    )

            mentioned = kept
            extraction["mentioned_aspects"] = mentioned

            existing_unmapped = extraction.get("unmapped_issues", []) or []
            extraction["unmapped_issues"] = existing_unmapped + moved_to_unmapped
            # ------------------------------------------------------------

            # Ensure stakeholder fallback is always present
            for m in mentioned:
                if not (m.get("stakeholder") or "").strip():
                    m["stakeholder"] = "product"

            # Per-aspect sentiment (using evidence snippets)
            evidence_texts = [
                (m.get("evidence") or "")[:500]
                for m in mentioned
                if (m.get("evidence") or "").strip()
            ]

            try:
                e_preds = sentiment.predict_labels(evidence_texts)
            except Exception as e:
                print(f"[WARN] Evidence sentiment failed raw_id={r.id}: {e}")
                e_preds = []

            ei = 0
            for m in mentioned:
                ev = (m.get("evidence") or "").strip()
                if not ev or ei >= len(e_preds):
                    m["sentiment"] = "Neutral"
                    m["sentiment_confidence"] = 0.0
                    continue

                m["sentiment"] = e_preds[ei]["label"]
                m["sentiment_confidence"] = e_preds[ei]["confidence"]
                ei += 1

            extraction["mentioned_aspects"] = mentioned

            # Stakeholder flags: count per sentiment per stakeholder
            flags: Dict[str, Dict[str, int]] = {}
            for m in mentioned:
                team = (m.get("stakeholder") or "product").strip() or "product"
                sent = (m.get("sentiment") or "Neutral").strip() or "Neutral"
                flags.setdefault(team, {"Positive": 0, "Neutral": 0, "Negative": 0})
                if sent not in flags[team]:
                    flags[team][sent] = 0
                flags[team][sent] += 1

            enriched_row = {
                "raw_id": r.id,
                "source": r.source,
                "source_review_id": r.source_review_id,
                "vertical": r.vertical,
                "created_at": r.created_at,
                "analyzed_at": datetime.now(timezone.utc),
                "overall_sentiment": overall_sentiment,
                "aspects_json": extraction,
                "stakeholder_flags_json": flags,
                "model_version": model,
                "prompt_version": "v1",
            }

            if insert_enriched(db, enriched_row):
                inserted += 1

        db.commit()

    print(f"Analyzed={len(raws)} InsertedEnrichedNew={inserted}")


if __name__ == "__main__":
    import argparse

    p = argparse.ArgumentParser()
    p.add_argument("--model", default="mistral:7b-instruct")
    p.add_argument("--batch", type=int, default=25)
    args = p.parse_args()
    main(model=args.model, batch_size=args.batch)
