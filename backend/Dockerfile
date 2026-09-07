# Vendor360 API
FROM python:3.14-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && \
    pip install --no-cache-dir "uvicorn[standard]"

COPY . .

# Runs unprivileged: a compromise in a dependency should not own the container.
RUN useradd --create-home --uid 10001 vendor360 && chown -R vendor360:vendor360 /app
USER vendor360

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health')"

# One worker by default, because the rate limiter keeps its counters in memory.
# Raising this means moving ratelimit.py to a shared store first -- see the note
# at the top of that file.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
