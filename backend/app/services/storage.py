"""Object storage abstraction: local disk (dev/test) or S3-compatible (MinIO)."""

from __future__ import annotations

import hashlib
import hmac
import os
import time
from abc import ABC, abstractmethod
from pathlib import Path
from urllib.parse import quote

from app.core.config import Settings
from app.core.errors import AppError

SIGN_TTL_SECONDS = 3600


class Storage(ABC):
    @abstractmethod
    def put(self, key: str, data: bytes, content_type: str) -> None: ...

    @abstractmethod
    def read(self, key: str) -> bytes: ...

    @abstractmethod
    def delete(self, key: str) -> None: ...

    @abstractmethod
    def exists(self, key: str) -> bool: ...

    @abstractmethod
    def public_url(self, key: str) -> str: ...

    @abstractmethod
    def signed_url(self, key: str, expires_in: int = SIGN_TTL_SECONDS) -> str: ...


class LocalStorage(Storage):
    """Files under STORAGE_LOCAL_ROOT, served by /api/v1/files endpoints."""

    def __init__(self, root: str, secret_key: str) -> None:
        self.root = Path(root).resolve()
        self.secret_key = secret_key.encode("utf-8")

    def _path(self, key: str) -> Path:
        p = (self.root / key).resolve()
        if not str(p).startswith(str(self.root)):
            raise AppError("INVALID_FILE_KEY", "Invalid storage key", status_code=400)
        return p

    def put(self, key: str, data: bytes, content_type: str) -> None:
        p = self._path(key)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)

    def read(self, key: str) -> bytes:
        p = self._path(key)
        if not p.is_file():
            raise AppError("FILE_NOT_FOUND", "File not found", status_code=404)
        return p.read_bytes()

    def delete(self, key: str) -> None:
        p = self._path(key)
        if p.is_file():
            p.unlink()

    def exists(self, key: str) -> bool:
        return self._path(key).is_file()

    def public_url(self, key: str) -> str:
        # Media (listing photos/thumbs) is public; served by the local file route.
        return f"/api/v1/files/public/{quote(key)}"

    def sign(self, key: str, expires: int) -> str:
        msg = f"{key}:{expires}".encode("utf-8")
        return hmac.new(self.secret_key, msg, hashlib.sha256).hexdigest()

    def verify(self, key: str, expires: int, token: str) -> bool:
        if expires < int(time.time()):
            return False
        return hmac.compare_digest(self.sign(key, expires), token)

    def signed_url(self, key: str, expires_in: int = SIGN_TTL_SECONDS) -> str:
        expires = int(time.time()) + expires_in
        token = self.sign(key, expires)
        return f"/api/v1/files?key={quote(key)}&expires={expires}&token={token}"


class S3Storage(Storage):
    """S3-compatible storage (MinIO locally). Never serves private docs unsigned."""

    def __init__(self, settings: Settings) -> None:
        import boto3  # lazy: only needed when STORAGE_BACKEND=s3
        from botocore.config import Config as BotoConfig

        self.settings = settings
        self.buckets = {
            "media": settings.s3_bucket_media,
            "documents": settings.s3_bucket_documents,
        }
        self.client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
            region_name=settings.s3_region,
            config=BotoConfig(s3={"addressing_style": "path" if settings.s3_use_path_style else "auto"}),
        )
        for bucket in self.buckets.values():
            try:
                self.client.head_bucket(Bucket=bucket)
            except Exception:  # noqa: BLE001
                try:
                    self.client.create_bucket(Bucket=bucket)
                except Exception:  # noqa: BLE001
                    pass

    def _bucket(self, key: str) -> str:
        if key.startswith("users/"):
            return self.buckets["documents"]
        return self.buckets["media"]

    def put(self, key: str, data: bytes, content_type: str) -> None:
        self.client.put_object(
            Bucket=self._bucket(key), Key=key, Body=data, ContentType=content_type
        )

    def read(self, key: str) -> bytes:
        try:
            resp = self.client.get_object(Bucket=self._bucket(key), Key=key)
            return resp["Body"].read()
        except Exception as exc:  # noqa: BLE001
            raise AppError("FILE_NOT_FOUND", "File not found", status_code=404) from exc

    def delete(self, key: str) -> None:
        try:
            self.client.delete_object(Bucket=self._bucket(key), Key=key)
        except Exception:  # noqa: BLE001
            pass

    def exists(self, key: str) -> bool:
        try:
            self.client.head_object(Bucket=self._bucket(key), Key=key)
            return True
        except Exception:  # noqa: BLE001
            return False

    def _base(self) -> str:
        endpoint = self.settings.s3_public_endpoint_url or self.settings.s3_endpoint_url or ""
        return endpoint.rstrip("/")

    def public_url(self, key: str) -> str:
        return f"{self._base()}/{self.buckets['media']}/{quote(key)}"

    def signed_url(self, key: str, expires_in: int = SIGN_TTL_SECONDS) -> str:
        bucket = self._bucket(key)
        base = self.settings.s3_public_endpoint_url or self.settings.s3_endpoint_url or ""
        # boto3 presigner against the public endpoint so browsers can reach MinIO.
        client = self.client
        if self.settings.s3_public_endpoint_url and (
            self.settings.s3_public_endpoint_url != self.settings.s3_endpoint_url
        ):
            import boto3
            from botocore.config import Config as BotoConfig

            client = boto3.client(
                "s3",
                endpoint_url=self.settings.s3_public_endpoint_url,
                aws_access_key_id=self.settings.s3_access_key,
                aws_secret_access_key=self.settings.s3_secret_key,
                region_name=self.settings.s3_region,
                config=BotoConfig(
                    s3={"addressing_style": "path" if self.settings.s3_use_path_style else "auto"}
                ),
            )
        return client.generate_presigned_url(
            "get_object",
            Params={"Bucket": bucket, "Key": key},
            ExpiresIn=expires_in,
        )


def build_storage(settings: Settings) -> Storage:
    if settings.storage_backend == "s3":
        return S3Storage(settings)
    root = settings.storage_local_root
    if not os.path.isabs(root):
        root = os.path.join(os.getcwd(), root)
    return LocalStorage(root, settings.secret_key)
