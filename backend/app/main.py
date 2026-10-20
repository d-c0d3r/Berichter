import asyncio
from typing import Annotated
from contextlib import asynccontextmanager, suppress

import ollama
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.router import api_router
from app.background_tasks import create_report, update_report


async def worker(queue):
    while True:
        job = await queue.get()
        try:
            match job.get("title"):
                case "create_report":
                    await asyncio.to_thread(
                        create_report, job["week_start"], job["week_end"]
                    )

                case "update_report":
                    await asyncio.to_thread(
                        update_report, job["name"], job["date"], job["content"]
                    )

        except Exception:
            pass
        finally:
            queue.task_done()


@asynccontextmanager
async def lifespan(app):
    app.state.task_queue = asyncio.Queue()
    task = asyncio.create_task(worker(app.state.task_queue))

    try:
        yield
    finally:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task


app = FastAPI(lifespan=lifespan)

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
