from datetime import date, timedelta
from typing import Annotated
import logging


import ollama
from fastapi import (
    APIRouter,
    Body,
    HTTPException,
    Query,
    status,
    Request,
    Path,
)
from fastapi.responses import StreamingResponse

from app import crud, schemas, helpers

from app.settings import settings
from app.database import GetAsyncDBSessionDependency



logger = logging.getLogger(__name__)

reports_router = APIRouter(
    prefix="/reports",
    tags=["Reports"]
)


@reports_router.post(
    "/",
    response_class=StreamingResponse,
    status_code=status.HTTP_200_OK,
)
async def generate_report(
    db: GetAsyncDBSessionDependency,
    request: Request,
    notes: Annotated[str, Body(max_length=400)],
    target_date: Annotated[date, Query()],
    use_ai: Annotated[bool, Query()]
):

    # Check if target date is a valid workday
    if target_date.weekday() > 4:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Report can be created only on Mo-Fr!"
        )

    async def generate_report(use_ai: bool):

        chunks = []

        if notes.lower() in ("urlaub", "krankmeldung"):
            use_ai = False

        try:
            if use_ai:
                message = {"role": "user", "content": notes}

                # Create new LLM connection if not already set
                if not settings.OLLAMA_CONNECTION:
                    settings.OLLAMA_CONNECTION = ollama.AsyncClient(settings.OLLAMA_URL)

                # Generate report using LLM
                async for part in await settings.OLLAMA_CONNECTION.chat(
                    model=settings.BERICHTER_MODEL,
                    messages=[message],
                    stream=True,
                    think=False
                ):
                    chunk = part["message"]["content"]
                    chunks.append(chunk)
                    yield chunk

            else:
                yield notes

        except Exception as ex:
            logging.error(f"Failed generating report: {ex}")
            yield notes

        # Build content from generated parts
        content = "".join(chunks) if chunks else notes

        # Request report file
        report_file = await crud.get_report_file_by_date(db=db, target_date=target_date)

        # Create report file if it doesn't exist
        if not report_file:
            report_number = await crud.get_new_report_file_number(db=db)

            report_file = await crud.create_new_report_file(
                db=db, target_date=target_date, report_number=report_number
            )

        # Request report
        report = await crud.get_report_by_date(db=db, report_date=target_date)

        if not report:
            # Create report if it doesn't exist
            report = await crud.create_new_report(
                db=db, report_file=report_file, report_date=target_date, content=content
            )

        else:
            # Update report
            report = await crud.update_report_by_date(
                db=db, report_date=target_date, new_content=content
            )

    return StreamingResponse(
        generate_report(use_ai=use_ai),
        status_code=status.HTTP_206_PARTIAL_CONTENT,
        media_type="text/plain",
    )


@reports_router.get("/missing")
async def get_missing_reports(db: GetAsyncDBSessionDependency):

    all_reports_dates = set()
    start_date, _ = helpers.get_week_bounds(settings.AUSBILDUNG_START_DATE)
    end_date = date.today()
    current_date = start_date

    while current_date <= end_date:
        if current_date.weekday() in range(0, 5):
            all_reports_dates.add(current_date)
        current_date += timedelta(days=1)

    existing_reports = await crud.get_reports(db=db, limit=None)
    existing_report_dates = set(report.report_date for report in existing_reports)

    missing_report_dates = all_reports_dates - existing_report_dates
    count = len(missing_report_dates)

    return {
        "count": count,
        "missing_dates": missing_report_dates
    }


@reports_router.get("/{report_date}", response_model=schemas.ReportResponse)
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
