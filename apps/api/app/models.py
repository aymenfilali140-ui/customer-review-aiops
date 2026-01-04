import uuid
from sqlalchemy import (
    String, Text, Integer, DateTime, UniqueConstraint, Index, ForeignKey
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column
from apps.api.app.db import Base
from typing import Optional, Dict, Any

class ReviewRaw(Base):
    __tablename__ = "reviews_raw"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    source: Mapped[str] = mapped_column(String(64), nullable=False)
    source_review_id: Mapped[str] = mapped_column(String(256), nullable=False)

    vertical: Mapped[str] = mapped_column(String(64), nullable=False)

    created_at: Mapped["DateTime"] = mapped_column(DateTime(timezone=True), nullable=False)
    ingested_at: Mapped["DateTime"] = mapped_column(DateTime(timezone=True), nullable=False)

    rating: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    language: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)

    original_text: Mapped[str] = mapped_column(Text, nullable=False)

    raw_payload: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, nullable=True)

    __table_args__ = (
        UniqueConstraint("source", "source_review_id", name="uq_reviews_raw_source_id"),
        Index("ix_reviews_raw_vertical_created", "vertical", "created_at"),
    )

class ReviewEnriched(Base):
    __tablename__ = "reviews_enriched"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    raw_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("reviews_raw.id"), nullable=False)

    source: Mapped[str] = mapped_column(String(64), nullable=False)
    source_review_id: Mapped[str] = mapped_column(String(256), nullable=False)
    vertical: Mapped[str] = mapped_column(String(64), nullable=False)

    created_at: Mapped["DateTime"] = mapped_column(DateTime(timezone=True), nullable=False)
    analyzed_at: Mapped["DateTime"] = mapped_column(DateTime(timezone=True), nullable=False)

    overall_sentiment: Mapped[str] = mapped_column(String(16), nullable=False)  # Positive/Neutral/Negative

    aspects_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    stakeholder_flags_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    model_version: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    prompt_version: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    __table_args__ = (
        UniqueConstraint("source", "source_review_id", name="uq_reviews_enriched_source_id"),
        Index("ix_reviews_enriched_vertical_created", "vertical", "created_at"),
        Index("ix_reviews_enriched_sentiment", "overall_sentiment"),
    )
