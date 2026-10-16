from datetime import date
from typing import Annotated

import ollama
import uvicorn
from fastapi import Depends, FastAPI, Body, Query, status, Request
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import select, update

from settings import settings, OLLAMA_CLIENT
from models import Report
from database import init_db, Base, engine


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
    allow_methods=["POST"],
    allow_headers=["Content-Type"],
)


@app.middleware("http")
async def db_init_middleware(request: Request, call_next):

    Base.metadata.create_all(bind=engine)

    response = await call_next(request)

    return response


@app.post(
    "/report",
    tags=["Report"],
    response_class=StreamingResponse,
    status_code=status.HTTP_206_PARTIAL_CONTENT
)
async def generate_report(
    db: Annotated[Session, Depends(init_db)],
    notes: Annotated[str, Body(max_length=400)],
    date_now: Annotated[date, Query()] = date.today(),
):
    message = {'role': 'user', 'content': notes}
    chunks = []

    async def generate_report():
        async for part in await OLLAMA_CLIENT.chat(model='berichter-large-qwen3', messages=[message], stream=True, think=False):
            chunk = part['message']['content']
            chunks.append(chunk)
            yield chunk

        content = "".join(chunks)

        if not (report:=db.execute(select(Report).where(Report.report_date == date_now)).fetchone()):
            new_report = Report(
                report_date=date_now,
                content=content
            )

            db.add(new_report)
            db.commit()
            db.refresh(new_report)

        else:
            db.execute(update(Report).where(Report.report_date == date_now).values(content=content))
            db.commit()

    return StreamingResponse(generate_report(), status_code=status.HTTP_200_OK, media_type="plain/text")


if __name__ == "__main__":
    uvicorn.run("main:app", reload=True)
