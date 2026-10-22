import asyncio
from typing import Annotated
from contextlib import asynccontextmanager, suppress

import ollama
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.router import api_router
from app import background_tasks


async def worker(queue):
    while True:
        job = await queue.get()
        try:
            match job.get("title"):
                case "create_report_file":
                    await asyncio.to_thread(
                        background_tasks.create_report_file,
                        job["report_number"],
                        job["target_date"],
                    )

                case "update_report_file":
                    await asyncio.to_thread(
                        background_tasks.update_report_file,
                        job["target_report_filename"],
                        job["target_date"],
                        job["content"],
                    )

        except Exception as e:
            print(e)
        finally:
            queue.task_done()


@asynccontextmanager
async def lifespan(app):
    app.state.queue = asyncio.Queue()
    task = asyncio.create_task(worker(app.state.queue))

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
