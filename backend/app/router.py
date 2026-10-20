from datetime import date
from calendar import weekday
from time import time
from typing import Annotated
from contextlib import asynccontextmanager, suppress
import asyncio

import ollama
import uvicorn
from fastapi import (
    Depends,
    APIRouter,
    Body,
    HTTPException,
    Path,
    Query,
    status,
    Request,
)
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import select, update

from app import crud
from app.schemas import ReportResponse
from app.settings import settings, OLLAMA_CLIENT
from app.models import Report
from app.database import GetAsyncDBSessionDependency


api_router = APIRouter(prefix="/api/v1", tags=["Reports"])


@api_router.post(
    "/report",
    response_class=StreamingResponse,
    status_code=status.HTTP_200_OK,
)
async def generate_report(
    db: GetAsyncDBSessionDependency,
    request: Request,
    notes: Annotated[str, Body(max_length=400)],
    date_now: Annotated[date, Query()] = date.today(),
):

    message = {"role": "user", "content": notes}
    chunks = []

    async def generate_report():
        async for part in await OLLAMA_CLIENT.chat(
            model=settings.BERICHTER_MODEL, messages=[message], stream=True, think=False
        ):
            chunk = part["message"]["content"]
            chunks.append(chunk)
            yield chunk

        # Build content from generated parts
        content = "".join(chunks)

        # Request report file
        report_file = await crud.get_report_file_by_date(db=db, target_date=date_now)

        # Create report file if it doesn't exist
        if not report_file:
            report_file = await crud.create_new_report_file(db=db, target_date=date_now)

        # Request report
        report = await crud.get_report_by_date(db=db, report_date=date_now)

        if not report:
            # Create report if it doesn't exist
            report = crud.create_new_report(
                db=db, report_file=report_file, report_date=date_now, content=content
            )

        else:
            # Update report
            report = await crud.update_report_by_date(
                db=db, report_date=date_now, new_content=content
            )

    return StreamingResponse(
        generate_report(),
        status_code=status.HTTP_206_PARTIAL_CONTENT,
        media_type="plain/text",
    )


@api_router.get("/report/{report_date}", response_model=ReportResponse)
async def get_report_by_date(
    db: GetAsyncDBSessionDependency, report_date: Annotated[date, Path()]
):

    report = await crud.get_report_by_date(
        db=db,
        report_date=report_date
    )

    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Kein Bericht für {report_date.strftime('%d %B')} vorhanden!",
        )

    return report


@api_router.get("/report", response_model=list[ReportResponse])
async def get_reports(
    db: GetAsyncDBSessionDependency,
    limit: Annotated[int, Query(le=100, gt=0)] = 10,
    offset: Annotated[int, Query(ge=0)] = 0,
):

    stmt = (
        select(Report).limit(limit).order_by(Report.report_date.desc()).offset(offset)
    )
    result = await db.execute(stmt)
    reports = result.scalars().all()

    if not reports:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Keine Berichte vorhanden!"
        )

    for report in reports:
        print(report.report_date, type(report.report_date))

    return reports
