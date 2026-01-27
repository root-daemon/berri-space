"""
Web Content Extraction Service

A FastAPI service using Playwright for JavaScript-rendered web content extraction.
This service is for internal use only and should NOT be exposed to the public internet.

Security features:
- URL validation (blocks internal IPs and private networks)
- Content size limits (1MB max)
- Request timeout enforcement (30s)
"""

import asyncio
import ipaddress
import os
import socket
from contextlib import asynccontextmanager
from typing import Optional
from urllib.parse import urlparse

from bs4 import BeautifulSoup
from fastapi import FastAPI, HTTPException
from playwright.async_api import async_playwright, Browser
from pydantic import BaseModel, HttpUrl, field_validator
from readability import Document

# Configuration from environment
MAX_CONTENT_LENGTH = int(os.getenv("MAX_CONTENT_LENGTH", 1048576))  # 1MB default
REQUEST_TIMEOUT = int(os.getenv("REQUEST_TIMEOUT", 30000))  # 30s default
MAX_BATCH_SIZE = 10

# Global browser instance
browser: Optional[Browser] = None


# =============================================================================
# Application Lifecycle
# =============================================================================


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage browser lifecycle."""
    global browser
    playwright = await async_playwright().start()
    browser = await playwright.chromium.launch(headless=True)
    yield
    await browser.close()
    await playwright.stop()


app = FastAPI(
    title="Berri Web Extraction Service",
    description="Internal web content extraction service",
    version="1.0.0",
    lifespan=lifespan,
)


# =============================================================================
# Request/Response Models
# =============================================================================


class CrawlRequest(BaseModel):
    """Single URL crawl request."""

    url: HttpUrl
    extract_main_content: bool = True

    @field_validator("url")
    @classmethod
    def validate_url_safety(cls, v: HttpUrl) -> HttpUrl:
        """Validate URL is safe to crawl (not internal/private)."""
        if not is_safe_url(str(v)):
            raise ValueError("URL points to internal or private network")
        return v


class BatchCrawlRequest(BaseModel):
    """Batch crawl request for multiple URLs."""

    urls: list[HttpUrl]
    extract_main_content: bool = True

    @field_validator("urls")
    @classmethod
    def validate_urls(cls, v: list[HttpUrl]) -> list[HttpUrl]:
        """Validate all URLs and limit batch size."""
        if len(v) > MAX_BATCH_SIZE:
            raise ValueError(f"Maximum {MAX_BATCH_SIZE} URLs per batch")
        for url in v:
            if not is_safe_url(str(url)):
                raise ValueError(f"URL {url} points to internal or private network")
        return v


class CrawlResult(BaseModel):
    """Result of a single URL crawl."""

    url: str
    title: Optional[str] = None
    content: str
    content_length: int
    success: bool
    error: Optional[str] = None


class BatchCrawlResult(BaseModel):
    """Result of batch crawl."""

    results: list[CrawlResult]
    total: int
    successful: int
    failed: int


class HealthResponse(BaseModel):
    """Health check response."""

    status: str
    version: str


# =============================================================================
# Security Functions
# =============================================================================


def is_safe_url(url: str) -> bool:
    """
    Check if a URL is safe to crawl.

    Blocks:
    - Private IP ranges (10.x, 172.16-31.x, 192.168.x)
    - Loopback addresses (127.x, localhost)
    - Link-local addresses (169.254.x)
    - Reserved addresses
    - Non-HTTP(S) schemes
    """
    try:
        parsed = urlparse(url)

        # Only allow HTTP and HTTPS
        if parsed.scheme not in ("http", "https"):
            return False

        hostname = parsed.hostname
        if not hostname:
            return False

        # Block localhost variations
        if hostname.lower() in (
            "localhost",
            "localhost.localdomain",
            "127.0.0.1",
            "::1",
            "0.0.0.0",
        ):
            return False

        # Resolve hostname to IP and check
        try:
            ip_addresses = socket.getaddrinfo(hostname, None)
            for family, _, _, _, sockaddr in ip_addresses:
                ip_str = sockaddr[0]
                ip = ipaddress.ip_address(ip_str)

                # Block private, loopback, link-local, and reserved
                if (
                    ip.is_private
                    or ip.is_loopback
                    or ip.is_link_local
                    or ip.is_reserved
                    or ip.is_multicast
                ):
                    return False

        except socket.gaierror:
            # DNS resolution failed - allow (will fail during actual crawl)
            pass

        return True

    except Exception:
        return False


# =============================================================================
# Crawling Functions
# =============================================================================


async def crawl_url(url: str, extract_main_content: bool = True) -> CrawlResult:
    """
    Crawl a single URL and extract content.

    Uses Playwright for JavaScript rendering support.
    Content is extracted using readability for main content isolation.
    """
    global browser

    result_data = {
        "url": url,
        "title": None,
        "content": "",
        "content_length": 0,
        "success": False,
        "error": None,
    }

    if browser is None:
        result_data["error"] = "Browser not initialized"
        return CrawlResult(**result_data)

    page = None
    try:
        # Create a new page with timeout
        page = await browser.new_page()
        page.set_default_timeout(REQUEST_TIMEOUT)

        # Navigate to the URL
        await page.goto(url, wait_until="domcontentloaded")

        # Get page content
        html = await page.content()

        if len(html) > MAX_CONTENT_LENGTH:
            result_data["error"] = f"Content exceeds {MAX_CONTENT_LENGTH} bytes"
            return CrawlResult(**result_data)

        # Extract title
        result_data["title"] = await page.title()

        if extract_main_content:
            # Use readability to extract main content
            try:
                doc = Document(html)
                result_data["title"] = doc.title() or result_data["title"]
                summary_html = doc.summary()

                # Convert to plain text
                soup = BeautifulSoup(summary_html, "lxml")
                result_data["content"] = soup.get_text(separator="\n", strip=True)
            except Exception:
                # Fallback to basic text extraction
                soup = BeautifulSoup(html, "lxml")

                # Remove script and style elements
                for element in soup(["script", "style", "nav", "footer", "header"]):
                    element.decompose()

                result_data["content"] = soup.get_text(separator="\n", strip=True)
        else:
            # Just extract all text
            soup = BeautifulSoup(html, "lxml")
            for element in soup(["script", "style"]):
                element.decompose()
            result_data["content"] = soup.get_text(separator="\n", strip=True)

        result_data["content_length"] = len(result_data["content"])
        result_data["success"] = True

    except asyncio.TimeoutError:
        result_data["error"] = "Request timed out"
    except Exception as e:
        result_data["error"] = str(e)[:200]  # Truncate error message
    finally:
        if page:
            await page.close()

    return CrawlResult(**result_data)


# =============================================================================
# API Endpoints
# =============================================================================


@app.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Health check endpoint."""
    return HealthResponse(status="healthy", version="1.0.0")


@app.post("/crawl", response_model=CrawlResult)
async def crawl_single(request: CrawlRequest) -> CrawlResult:
    """
    Crawl a single URL and extract content.

    Security:
    - URL must not point to internal/private networks
    - Content is limited to 1MB
    - Request timeout is 30s
    """
    return await crawl_url(str(request.url), request.extract_main_content)


@app.post("/crawl/batch", response_model=BatchCrawlResult)
async def crawl_batch(request: BatchCrawlRequest) -> BatchCrawlResult:
    """
    Crawl multiple URLs in parallel.

    Security:
    - Maximum 10 URLs per batch
    - All URLs validated for safety
    - Each URL has independent timeout
    """
    # Crawl all URLs concurrently
    tasks = [
        crawl_url(str(url), request.extract_main_content) for url in request.urls
    ]
    results = await asyncio.gather(*tasks)

    successful = sum(1 for r in results if r.success)

    return BatchCrawlResult(
        results=list(results),
        total=len(results),
        successful=successful,
        failed=len(results) - successful,
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", 8889)))
