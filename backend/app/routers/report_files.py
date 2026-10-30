from datetime import date, timedelta
from typing import Annotated
import os

from fastapi import (
    Depends,
    APIRouter,
    HTTPException,
    Path,
    Query,
    status,
    Request,
)
from fastapi.responses import FileResponse

from app import crud, schemas, helpers, docxutil
from app.database import GetAsyncDBSessionDependency


report_files_router = APIRouter(prefix="/report-files")


@report_files_router.get(
    "/{target_date}", response_model=schemas.ReportFileWithReportsResponse
)
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


@report_files_router.get(
    "/", response_model=list[schemas.ReportFileWithReportsResponse]
)
async def get_reports_for_weeks(
    db: GetAsyncDBSessionDependency,
    limit: Annotated[int, Query()] = 10,
    offset: Annotated[int, Query()] = 0,
):

    report_files = await crud.get_report_files(
        db=db, limit=limit, offset=offset, include_reports=True
    )

    return report_files


@report_files_router.post("/archive", response_class=FileResponse)
async def generate_report_file_and_send_as_zip(
    db: GetAsyncDBSessionDependency,
    start_date: Annotated[date, Query()],
    end_date: Annotated[date, Query()],
):

    start_week_date, _ = helpers.get_week_bounds(start_date)
    end_week_date, _ = helpers.get_week_bounds(end_date)
    current_week_date = start_week_date

    files = []

    while current_week_date <= end_week_date:
        current_report_file = await crud.get_report_file_by_date(
            db=db, target_date=current_week_date, include_reports=True
        )

        if current_report_file:
            filepath = docxutil.fill_report_file(report_file=current_report_file)
            files.append(filepath)

        current_week_date += timedelta(days=7)

    zip_file = docxutil.report_files_to_zip(files=files)

    return FileResponse(
        path=zip_file,
        status_code=200,
        filename=os.path.basename(zip_file),
        media_type="applications/zip",
    )
