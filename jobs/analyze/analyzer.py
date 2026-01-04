from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

import yaml

from apps.api.app.db import SessionLocal, engine
from apps.api.app.models import Base, ReviewRaw, ReviewEnriched
from jobs.analyze.extraction_ollama import render_prompt, call_ollama_json
from jobs.analyze.sentiment_hf import SentimentClassifier


def load_vertical_config() -> Dict[str, Any]:
    path = Path("packages/shared/verticals.yml")
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def build_aspect_to_stakeholder(cfg: Dict[str, Any], vertical_key: str) -> Dict[str, str]:
    # Start with global mapping
    aspect_to_team: Dict[str, str] = {}

    global_stakeholders = cfg.get("global_stakeholders", {})
    for team, aspects in global_stakeholders.items():
        for a in aspects:
            aspect_to_team[a] = team

    v = cfg["verticals"][vertical_key]
    stakeholders = v.get("stakeholders", {})
    for team, aspects in stakeholders.items():
        for a in aspects:
            aspect_to_team[a] = team

    return aspect_to_team


def select_raws(db, limit: int = 50, force: bool = False) -> List[ReviewRaw]:
    """
    - Default: only raws that do not exist in enriched (by raw_id)
    - Force: take latest raws regardless (will upsert into enriched)
    """
    if force:
        stmt = select(ReviewRaw).order_by(ReviewRaw.created_at.desc()).limit(limit)
        return db.execute(stmt).scalars().all()

    subq = select(ReviewEnriched.raw_id)
    stmt = (
        select(ReviewRaw)
        .where(~ReviewRaw.id.in_(subq))
        .order_by(ReviewRaw.created_at.desc())
        .limit(limit)
    )
    return db.execute(stmt).scalars().all()


def upsert_enriched(db, row: Dict[str, Any], force: bool = False) -> bool:
    """
    - Default: insert if not exists
    - Force: upsert (update on conflict) to allow re-analysis
    """
    stmt = insert(ReviewEnriched).values(**row)

    if not force:
        stmt = stmt.on_conflict_do_nothing(index_elements=["source", "source_review_id"])
        res = db.execute(stmt)
        return res.rowcount == 1

    # Force mode: update key fields on conflict
    stmt = stmt.on_conflict_do_update(
        index_elements=["source", "source_review_id"],
        set_={
            "raw_id": stmt.excluded.raw_id,
            "vertical": stmt.excluded.vertical,
            "created_at": stmt.excluded.created_at,
            "analyzed_at": stmt.excluded.analyzed_at,
            "overall_sentiment": stmt.excluded.overall_sentiment,
            "aspects_json": stmt.excluded.aspects_json,
            "stakeholder_flags_json": stmt.excluded.stakeholder_flags_json,
            "model_version": stmt.excluded.model_version,
            "prompt_version": stmt.excluded.prompt_version,
        },
    )
    db.execute(stmt)
    return True


def main(
    model: str = "mistral:7b-instruct",
    batch_size: int = 25,
    force: bool = False,
    prompt_version: str = "v1",
) -> None:
    Base.metadata.create_all(bind=engine)
    cfg = load_vertical_config()
    sentiment = SentimentClassifier()
    template_path = Path("jobs/analyze/prompts/extraction.jinja")

    inserted_or_updated = 0

    with SessionLocal() as db:
        raws = select_raws(db, limit=batch_size, force=force)

        for r in raws:
            vertical_key = r.vertical

            allowed = list(cfg.get("global_aspects", []))
            allowed.extend(cfg["verticals"].get(vertical_key, {}).get("aspects", []))
            allowed = sorted(set(allowed))

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

            extraction = call_ollama_json(model=model, prompt=prompt)

            # Overall sentiment from original text
            overall_pred = sentiment.predict_labels([r.original_text])[0]
            overall_sentiment = overall_pred["label"]

            mentioned = extraction.get("mentioned_aspects", []) or []

            # Guardrail: only keep aspects from allowed list
            allowed_set = set(allowed)
            kept: List[Dict[str, Any]] = []
            moved_to_unmapped: List[Dict[str, Any]] = []

            for m in mentioned:
                asp = (m.get("aspect") or "").strip()
                if asp in allowed_set:
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

            # Per-aspect sentiment using evidence text
            evidence_texts = [m.get("evidence", "")[:500] for m in mentioned if (m.get("evidence") or "").strip()]
            e_preds = sentiment.predict_labels(evidence_texts)

            ei = 0
            for m in mentioned:
                ev = (m.get("evidence") or "").strip()
                if not ev:
                    m["sentiment"] = "Neutral"
                    m["sentiment_confidence"] = 0.0
                    continue
                m["sentiment"] = e_preds[ei]["label"]
                m["sentiment_confidence"] = e_preds[ei]["confidence"]
                ei += 1

            extraction["mentioned_aspects"] = mentioned

            # Stakeholder sentiment flags
            flags: Dict[str, Dict[str, int]] = {}
            for m in mentioned:
                team = m.get("stakeholder") or "product"
                sent = m.get("sentiment") or "Neutral"
                flags.setdefault(team, {"Positive": 0, "Neutral": 0, "Negative": 0})
                if sent not in flags[team]:
                    sent = "Neutral"
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
                "prompt_version": prompt_version,
            }

            if upsert_enriched(db, enriched_row, force=force):
                inserted_or_updated += 1

        db.commit()

    print(f"Analyzed={len(raws)} InsertedOrUpdated={inserted_or_updated} Force={force} PromptVersion={prompt_version}")


if __name__ == "__main__":
    import argparse

    p = argparse.ArgumentParser()
    p.add_argument("--model", default="mistral:7b-instruct")
    p.add_argument("--batch", type=int, default=25)
    p.add_argument("--force", action="store_true", help="Re-analyze and upsert even if enriched already exists")
    p.add_argument("--prompt-version", default="v1", help="Track prompt changes over time (e.g., v1, v2)")
    args = p.parse_args()

    main(model=args.model, batch_size=args.batch, force=args.force, prompt_version=args.prompt_version)
