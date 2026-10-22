from datetime import date, timedelta
from fileinput import filename

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import desc, select, update, func
from sqlalchemy.orm import selectinload

from app.settings import settings
from app.helpers import get_week_bounds
from app import models


async def create_new_report_file(
    db: AsyncSession, target_date: date, report_number: int
):

    # Calculate friday's date
    week_start, week_end = get_week_bounds(target_date)

    # Create new report file object
    new_report_file = models.ReportFile(
        week_start=week_start,
        filename=settings.BERICHTSHEFT_BASE_FILENAME.format(
            report_number=report_number,
            week_start=week_start.strftime("%d.%m.%Y"),
            week_end=week_end.strftime("%d.%m.%Y"),
        ),
    )

    # Add new object to database and commit
    db.add(new_report_file)

    # Return created report file object
    return new_report_file


async def get_report_files(
    db: AsyncSession,
    limit: int = 10,
    offset: int = 0,
    include_reports: bool = False
):

    # Search for report files with the specified limit and offset
    stmt = select(models.ReportFile).order_by(desc(models.ReportFile.week_start)).limit(limit).offset(offset)

    if include_reports:
        stmt = stmt.options(selectinload(models.ReportFile.reports))

    # Execute SQL query
    result = await db.execute(stmt)
    target_report_files = result.scalars().all()

    # Return found result
    return target_report_files


async def get_report_file_by_date(
    db: AsyncSession,
    target_date: date,
    include_reports: bool = False,
):

    # Calculating monday's date
    week_start, _ = get_week_bounds(target_date)

    # Search for report file with the calculated date of week start
    stmt = select(models.ReportFile).filter(models.ReportFile.week_start == week_start)

    if include_reports:
        stmt = stmt.options(selectinload(models.ReportFile.reports))

    # Execute SQL query
    result = await db.execute(stmt)
    target_report_file = result.scalar_one_or_none()

    # Return found result or none
    return target_report_file


async def get_new_report_file_number(db: AsyncSession):

    stmt = select(func.count()).select_from(models.ReportFile)

    count = await db.scalar(stmt)

    if isinstance(count, int):
        count += 1

        return count

    return 1


async def create_new_report(
    db: AsyncSession, report_file: models.ReportFile, report_date: date, content: str
):

    # Create new report file object
    new_report = models.Report(
        report_file_id=report_file.id, report_date=report_date, content=content
    )

    # Add new object to database and commit
    db.add(new_report)

    # Return new report object
    return new_report


async def update_report_by_date(db: AsyncSession, report_date: date, new_content: str):

    # Query to search and update report by report's date
    stmt = (
        update(models.Report)
        .where(models.Report.report_date == report_date)
        .values(content=new_content)
        .returning(models.Report)
    )

    # Execute query and commit changes to db
    result = await db.execute(stmt)
    updated_report = result.scalar_one_or_none()

    # Return updated report object
    return updated_report


async def get_report_by_date(db: AsyncSession, report_date: date):

    # Query to search report by report's date
    stmt = select(models.Report).filter(models.Report.report_date == report_date)

    # Execute query and fetch the result
    result = await db.execute(stmt)
    target_report = result.scalar_one_or_none()

    # Return found report object
    return target_report
