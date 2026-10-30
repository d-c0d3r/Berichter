import asyncio
from typing import Annotated

import ollama
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.routers import report_files_router, reports_router

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost",
        "http://localhost:80",
        "http://127.0.0.1",
        "http://127.0.0.1:80",
    ],
    allow_credentials=False,
    allow_methods=["POST", "GET"],
    allow_headers=["Content-Type"],
)

app.include_router(report_files_router, prefix="/api/v1")
app.include_router(reports_router, prefix="/api/v1")

if __name__ == "__main__":
    uvicorn.run("main:app", reload=True)
