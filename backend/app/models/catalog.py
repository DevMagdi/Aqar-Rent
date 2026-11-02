"""Catalog tables: locations, listings, media, plans."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, JSONType, TimestampMixin


class Location(TimestampMixin, Base):
    __tablename__ = "locations"

    parent_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("locations.id", ondelete="CASCADE"), nullable=True, index=True
    )
    level: Mapped[str] = mapped_column(String(20), index=True)  # governorate|city|district
    name_ar: Mapped[str] = mapped_column(String(120))
    name_en: Mapped[str] = mapped_column(String(120))

    __table_args__ = (Index("ix_locations_level_parent", "level", "parent_id"),)


class Listing(TimestampMixin, Base):
    __tablename__ = "listings"

    owner_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    property_type: Mapped[str] = mapped_column(String(20))  # enums.PropertyType
    rental_type: Mapped[str] = mapped_column(String(20))  # enums.RentalType
    furnished: Mapped[str] = mapped_column(String(20))  # enums.Furnished
    rent_monthly: Mapped[int] = mapped_column(Integer)  # EGP per month (BR-12)
    deposit_months: Mapped[int] = mapped_column(Integer, default=1)
    area_m2: Mapped[float] = mapped_column(Float)
    bedrooms: Mapped[int] = mapped_column(Integer, default=0)
    bathrooms: Mapped[int] = mapped_column(Integer, default=0)
    floor: Mapped[int | None] = mapped_column(Integer, nullable=True)
    has_elevator: Mapped[bool] = mapped_column(Boolean, default=False)
    finishing: Mapped[str | None] = mapped_column(String(30), nullable=True)  # enums.Finishing
    building_age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    amenities: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)
    description: Mapped[str] = mapped_column(Text, default="")
    governorate_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("locations.id", ondelete="RESTRICT"), index=True
    )
    city_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("locations.id", ondelete="RESTRICT"), index=True)
    district_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("locations.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    address_text: Mapped[str] = mapped_column(String(300))
    # Map pin: lat/lon are the ORM source of truth; on PostgreSQL a trigger keeps
    # `geo geography(Point,4326)` in sync and a GiST index sits on it (spec).
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    available_from: Mapped[date | None] = mapped_column(Date, nullable=True)
    min_term_months: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String(20), default="draft", index=True)
    # Denormalized ad rank (kept in sync by activate/cancel/expire paths) —
    # lets the public "newest" sort use a plain indexed ORDER BY at scale.
    ad_priority: Mapped[float] = mapped_column(Float, default=0.0, server_default="0")
    ad_starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reject_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    view_count: Mapped[int] = mapped_column(Integer, default=0)

    owner: Mapped[Any] = relationship("User", back_populates="listings")
    media: Mapped[list[ListingMedia]] = relationship(
        back_populates="listing",
        cascade="all, delete-orphan",
        order_by="ListingMedia.sort_order",
        lazy="selectin",
    )

    __table_args__ = (
        # Spec composite index for filter-heavy search paths.
        Index(
            "ix_listings_status_gov_city_district_price",
            "status",
            "governorate_id",
            "city_id",
            "district_id",
            "rent_monthly",
        ),
    )


class ListingMedia(TimestampMixin, Base):
    __tablename__ = "listing_media"

    listing_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("listings.id", ondelete="CASCADE"), index=True)
    type: Mapped[str] = mapped_column(String(10), default="photo")  # enums.MediaType
    file_key: Mapped[str] = mapped_column(String(512))
    thumb_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    # Perceptual hash for duplicate-photo (anti-broker) detection — BR-12/anti-broker.
    phash: Mapped[str | None] = mapped_column(String(16), nullable=True)

    listing: Mapped[Listing] = relationship(back_populates="media")


class Plan(TimestampMixin, Base):
    __tablename__ = "plans"

    name: Mapped[str] = mapped_column(String(80))
    price_egp: Mapped[float] = mapped_column(Numeric(10, 2))  # BR-1: never hard-coded
    duration_days: Mapped[int] = mapped_column(Integer, default=7)
    priority_weight: Mapped[int] = mapped_column(Integer, default=0)  # BR-4
    active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
