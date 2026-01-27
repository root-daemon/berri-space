# Crawlee Web Extraction Service
# Based on Playwright Python image for JavaScript rendering support

FROM mcr.microsoft.com/playwright/python:v1.48.0-jammy

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright browsers
RUN playwright install chromium

# Copy application code
COPY main.py .

# Create non-root user for security (use UID 1001 to avoid conflicts)
RUN useradd -m -u 1001 crawlee || true
RUN chown -R 1001:1001 /app
USER 1001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:8889/health || exit 1

# Expose port
EXPOSE 8889

# Run the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8889"]
