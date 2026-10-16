from datetime import date
from time import time
from typing import Annotated

import ollama
import uvicorn
from fastapi import Depends, FastAPI, Body, HTTPException, Path, Query, status, Request
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import select, update

from schemas import ReportResponse
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
    allow_methods=["POST", "GET"],
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
        async for part in await OLLAMA_CLIENT.chat(model=settings.BERICHTER_MODEL, messages=[message], stream=True, think=False):
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

    return StreamingResponse(generate_report(), status_code=status.HTTP_206_PARTIAL_CONTENT, media_type="plain/text")


@app.get(
    "/report/{report_date}",
    response_model=ReportResponse
)
async def get_report_by_date(
    db: Annotated[Session, Depends(init_db)],
    report_date: Annotated[date, Path()]
):

    report = db.execute(select(Report).where(Report.report_date == report_date)).scalar_one_or_none()

    if not report:

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Kein Bericht für {report_date.strftime("%d %B")} vorhanden!"
        )

    return report


@app.get(
    "/report",
    response_model=list[ReportResponse]
)
async def get_reports(
    db: Annotated[Session, Depends(init_db)],
    limit: Annotated[int, Query(le=100, gt=0)] = 10,
    offset: Annotated[int, Query(ge=0)] = 0
):

    reports = db.execute(
        select(Report)
        .limit(limit)
        .order_by(Report.report_date.desc())
        .offset(offset)
    ).scalars().fetchall()


    if not reports:

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Keine Berichte vorhanden!"
        )

    for report in reports:
        print(report.report_date, type(report.report_date))

    return reports

if __name__ == "__main__":
    uvicorn.run("main:app", reload=True)
