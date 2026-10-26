FROM python:3.13-slim

COPY --from=ghcr.io/astral-sh/uv:0.9.5 /uv /uvx /bin/

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_PYTHON_DOWNLOADS=never \
    UV_LINK_MODE=copy \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app
COPY pyproject.toml ./
RUN uv sync --no-install-project --no-dev

COPY backend/ /app/backend/
COPY --chmod=755 backend/entrypoint.sh /app/backend/entrypoint.sh

RUN mkdir -p /data

WORKDIR /app/backend

EXPOSE 8000

ENTRYPOINT ["/app/backend/entrypoint.sh"]

CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port 8000"]