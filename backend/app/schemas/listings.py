"""Listing CRUD / media / detail / search / contact / favorites / reports schemas."""

from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.enums import Finishing, Furnished, PropertyType, RentalType, ReportReason

AMENITY_KEYS_MAX = 40


class ListingBase(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    property_type: PropertyType
    rental_type: RentalType
    furnished: Furnished
    rent_monthly: int = Field(ge=100, le=10_000_000)  # BR-12: monthly price in EGP
    deposit_months: int = Field(default=1, ge=0, le=24)
    area_m2: float = Field(gt=0, le=10_000)
    bedrooms: int = Field(default=0, ge=0, le=30)
    bathrooms: int = Field(default=0, ge=0, le=30)
    floor: int | None = Field(default=None, ge=-5, le=100)
    has_elevator: bool = False
    finishing: Finishing | None = None
    building_age: int | None = Field(default=None, ge=0, le=300)
    amenities: dict[str, bool] = Field(default_factory=dict)
    description: str = Field(default="", max_length=5_000)
    governorate_id: UUID
    city_id: UUID
    district_id: UUID | None = None
    address_text: str = Field(min_length=3, max_length=300)
    latitude: float = Field(ge=21.5, le=32.0)  # Egypt bounds (loose)
    longitude: float = Field(ge=24.0, le=37.5)
    available_from: date | None = None
    min_term_months: int = Field(default=1, ge=1, le=36)

    @field_validator("amenities")
    @classmethod
    def _amenity_keys(cls, v: dict[str, bool]) -> dict[str, bool]:
        if len(v) > AMENITY_KEYS_MAX:
            raise ValueError(f"too many amenities (max {AMENITY_KEYS_MAX})")
        for key in v:
            if not key.replace("_", "").isalnum():
                raise ValueError(f"invalid amenity key: {key}")
        return v


class ListingCreate(ListingBase):
    pass


class ListingPatch(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=200)
    property_type: PropertyType | None = None
    rental_type: RentalType | None = None
    furnished: Furnished | None = None
    rent_monthly: int | None = Field(default=None, ge=100, le=10_000_000)
    deposit_months: int | None = Field(default=None, ge=0, le=24)
    area_m2: float | None = Field(default=None, gt=0, le=10_000)
    bedrooms: int | None = Field(default=None, ge=0, le=30)
    bathrooms: int | None = Field(default=None, ge=0, le=30)
    floor: int | None = Field(default=None, ge=-5, le=100)
    has_elevator: bool | None = None
    finishing: Finishing | None = None
    building_age: int | None = Field(default=None, ge=0, le=300)
    amenities: dict[str, bool] | None = None
    description: str | None = Field(default=None, max_length=5_000)
    governorate_id: UUID | None = None
    city_id: UUID | None = None
    district_id: UUID | None = None
    address_text: str | None = Field(default=None, min_length=3, max_length=300)
    latitude: float | None = Field(default=None, ge=21.5, le=32.0)
    longitude: float | None = Field(default=None, ge=24.0, le=37.5)
    available_from: date | None = None
    min_term_months: int | None = Field(default=None, ge=1, le=36)

    @field_validator("amenities")
    @classmethod
    def _amenity_keys(cls, v: dict[str, bool] | None) -> dict[str, bool] | None:
        if v is None:
            return v
        return ListingBase._amenity_keys(v)

    @model_validator(mode="after")
    def _non_empty(self) -> ListingPatch:
        if not self.model_fields_set:
            raise ValueError("no fields to update")
        return self


class MediaOut(BaseModel):
    id: str
    type: str
    url: str
    thumb_url: str | None = None
    sort_order: int


class GeoOut(BaseModel):
    latitude: float
    longitude: float
    accuracy_m: int  # 150 for approximate public pins, 0 when exact


class ListingDetailOut(BaseModel):
    id: str
    owner_id: str
    title: str
    property_type: str
    rental_type: str
    furnished: str
    rent_monthly: int
    deposit_months: int
    area_m2: float
    bedrooms: int
    bathrooms: int
    floor: int | None = None
    has_elevator: bool
    finishing: str | None = None
    building_age: int | None = None
    amenities: dict
    description: str
    governorate_id: str
    city_id: str
    district_id: str | None = None
    address_text: str
    geo: GeoOut
    available_from: date | None = None
    min_term_months: int
    status: str | None = None  # owner/admin views only
    reject_reason: str | None = None
    view_count: int | None = None
    verified_badge: bool = False
    is_owner: bool = False
    days_left: int | None = None
    owner_name: str | None = None
    media: list[MediaOut] = Field(default_factory=list)
    created_at: datetime | None = None
    published_at: datetime | None = None


class SearchItemOut(BaseModel):
    id: str
    title: str
    property_type: str
    rental_type: str
    furnished: str
    rent_monthly: int
    area_m2: float
    bedrooms: int
    bathrooms: int
    floor: int | None = None
    governorate_id: str
    city_id: str
    district_id: str | None = None
    address_text: str
    geo: GeoOut
    available_from: date | None = None
    thumb_url: str | None = None
    created_at: datetime | None = None


class SearchResultOut(BaseModel):
    items: list[SearchItemOut]
    next_cursor: str | None = None
    limit: int = 20


class ContactOut(BaseModel):
    phone: str
    full_name: str | None = None
    channel: str = "show"


class FavoriteItemOut(SearchItemOut):
    status: str  # listing status so the UI can grey out expired ones


class FavoritesOut(BaseModel):
    items: list[FavoriteItemOut]
    next_cursor: str | None = None
    limit: int = 20


class ReportIn(BaseModel):
    reason: ReportReason
    note: str | None = Field(default=None, max_length=1_000)


class ReportOut(BaseModel):
    id: str
    listing_id: str
    reason: str
    status: str
    created_at: datetime | None = None
