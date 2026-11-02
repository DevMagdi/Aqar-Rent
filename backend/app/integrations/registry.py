"""Official rental-registry integration seam (future-proof, honest).

As of 2026-11-02 Egypt has NO official digital rental registry equivalent to
Saudi Ejar. Aqar Rent contracts are PRIVATE AGREEMENTS: they are not notarized,
not registered, and are not executive instruments (سند تنفيذي).

This module defines the adapter contract so that if/when an official registry
launches, integration is a single implementation + config switch — no changes
to the contract domain, and no fake "registered" badge in the meantime.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

from app.models.enums import RegistryStatus
from app.models.social import Contract


@dataclass(frozen=True)
class RegistrySubmission:
    status: str
    reference: str | None = None
    detail_ar: str = ""
    detail_en: str = ""
    payload: dict[str, Any] | None = None


class OfficialRegistryAdapter(Protocol):
    """Implement when a real, contracted government API exists."""

    name: str

    def is_available(self) -> bool: ...

    def submit(self, contract: Contract) -> RegistrySubmission: ...

    def lookup(self, reference: str) -> RegistrySubmission: ...


class NoOpRegistryAdapter:
    """Production default. Never pretends a private contract is official."""

    name = "none"

    def is_available(self) -> bool:
        return False

    def submit(self, contract: Contract) -> RegistrySubmission:
        return RegistrySubmission(
            status=RegistryStatus.unavailable.value,
            detail_ar=(
                "لا يوجد حالياً سجل إيجار رقمي حكومي مصري معتمد يمكن الربط به. "
                "هذا العقد اتفاق خاص بين الطرفين، ولا يُغني عن التسجيل أو التوثيق الرسمي."
            ),
            detail_en=(
                "Egypt has no official digital rental registry available for integration today. "
                "This is a private agreement and does not replace official registration or notarization."
            ),
        )

    def lookup(self, reference: str) -> RegistrySubmission:
        return RegistrySubmission(
            status=RegistryStatus.unavailable.value,
            detail_ar="لا يوجد سجل رسمي متاح للاستعلام.",
            detail_en="No official registry is available to query.",
        )


def get_registry_adapter(settings) -> OfficialRegistryAdapter:
    """Only `none` is shipped. A future adapter must pass legal + security review."""
    name = getattr(settings, "registry_adapter", "none")
    if name != "none":
        raise ValueError(
            "REGISTRY_ADAPTER must be 'none' until an official Egyptian registry "
            "exists and a reviewed adapter is implemented"
        )
    return NoOpRegistryAdapter()


def registry_status_for(contract: Contract, settings) -> dict[str, Any]:
    adapter = get_registry_adapter(settings)
    if not adapter.is_available():
        result = adapter.submit(contract)
        return {
            "available": False,
            "status": RegistryStatus.unavailable.value,
            "registry_adapter": adapter.name,
            "reference": None,
            "detail_ar": result.detail_ar,
            "detail_en": result.detail_en,
            "contract_kind": "private_agreement",
            "is_executive_instrument": False,
            "replaces_notarization": False,
        }
    return {
        "available": True,
        "status": contract.registry_status,
        "registry_adapter": adapter.name,
        "reference": contract.registry_ref,
        "is_executive_instrument": False,
        "replaces_notarization": False,
    }
