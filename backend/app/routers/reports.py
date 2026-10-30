from datetime import date
from typing import Annotated

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

from app import crud, schemas

from app.settings import settings
from app.database import GetAsyncDBSessionDependency


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
