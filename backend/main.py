import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router

app = FastAPI(title="API Repuestos")

origenes_permitidos = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://autobought.vercel.app",
]

if origen_extra := os.getenv("CORS_EXTRA_ORIGIN"):
    origenes_permitidos.append(origen_extra)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origenes_permitidos,
    allow_origin_regex=r"https://.*\.app\.github\.dev",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")

