FROM python:3.14-slim
RUN pip install --no-cache-dir uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev
COPY . .
EXPOSE 8501
CMD ["uv", "run", "--no-dev", "streamlit", "run", "app.py", "--server.address", "0.0.0.0", "--server.port", "8501"]
