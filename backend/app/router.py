from datetime import date
from calendar import weekday
from time import time
from typing import Annotated
from contextlib import asynccontextmanager, suppress
import asyncio

import ollama
from starlette.datastructures import QueryParams
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

from app import crud, schemas
from app.settings import settings, OLLAMA_CLIENT
from app.database import GetAsyncDBSessionDependency


api_router = APIRouter(prefix="/api/v1", tags=["Reports"])


@api_router.post(
    "/reports",
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
    queue = request.app.state.queue
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
            report_number = await crud.get_new_report_file_number(db=db)

            report_file = await crud.create_new_report_file(
                db=db, target_date=date_now, report_number=report_number
            )

            queue.put_nowait(
                {
                    "title": "create_report_file",
                    "report_number": report_number,
                    "target_date": date_now,
                }
            )

        # Request report
        report = await crud.get_report_by_date(db=db, report_date=date_now)

        if not report:
            # Create report if it doesn't exist
            report = await crud.create_new_report(
                db=db, report_file=report_file, report_date=date_now, content=content
            )

        else:
            # Update report
            report = await crud.update_report_by_date(
                db=db, report_date=date_now, new_content=content
            )

        queue.put_nowait(
            {
                "title": "update_report_file",
                "target_report_filename": report_file.filename,
                "target_date": date_now,
                "content": content,
            }
        )

    return StreamingResponse(
        generate_report(),
        status_code=status.HTTP_206_PARTIAL_CONTENT,
        media_type="text/plain",
    )


@api_router.get("/reports/{report_date}", response_model=schemas.ReportResponse)
async def get_report_by_date(
    db: GetAsyncDBSessionDependency, report_date: Annotated[date, Path()]
):

    report = await crud.get_report_by_date(db=db, report_date=report_date)

    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Keine Berichte für {report_date.strftime('%d %B')} vorhanden!",
        )

    return report


@api_router.get("/report-files/{target_date}", response_model=schemas.ReportFileWithReportsResponse)
async def get_reports_for_week(
    db: GetAsyncDBSessionDependency,
    target_date: Annotated[date, Path()],
):

    report_file = await crud.get_report_file_by_date(
        db=db, target_date=target_date, include_reports=True
    )

    if not report_file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Keine Berichte vorhanden!"
        )

    return report_file


@api_router.get("/report-files", response_model=list[schemas.ReportFileWithReportsResponse])
async def get_reports_for_weeks(
    db: GetAsyncDBSessionDependency,
    limit: Annotated[int, Query()] = 10,
    offset: Annotated[int, Query()] = 0,
):

    report_files = await crud.get_report_files(
        db=db,
        limit=limit,
        offset=offset,
        include_reports=True
    )

    return report_files
