import asyncio
from typing import Annotated

import ollama
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import select, update

from schemas import ReportResponse
from settings import settings, OLLAMA_CLIENT
from models import Report
from database import GetAsyncDBSessionDependency


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

app.include_router(api_router)

if __name__ == "__main__":
    uvicorn.run("main:app", reload=True)
