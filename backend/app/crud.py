from datetime import date, timedelta
from fileinput import filename

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from sqlalchemy.orm import selectinload

from app.settings import settings
from app.helpers import get_week_bounds
from app.models import *


async def create_new_report_file(db: AsyncSession, target_date: date):

    # Calculate friday's date
    week_start, week_end = get_week_bounds(target_date)

    # Create new report file object
    new_report_file = ReportFile(
        week_start=week_start,
        filename=settings.BERICHTSHEFT_BASE_FILENAME.format(
            week_start=week_start, week_end=week_end
        ),
    )

    # Add new object to database and commit
    db.add(new_report_file)
    await db.commit()
    await db.refresh(new_report_file)

    # Return created report file object
    return new_report_file


async def get_report_file_by_date(db: AsyncSession, target_date: date):

    # Calculating monday's date
    week_start, _ = get_week_bounds(target_date)

    # Search for report file with the calculated date of week start
    stmt = (
        select(ReportFile)
        .filter(ReportFile.week_start == week_start)
        .options(selectinload(ReportFile.reports))
    )

    # Execute SQL query
    result = await db.execute(stmt)
    target_report_file = result.scalar_one_or_none()

    # Return found result or none
    return target_report_file


async def create_new_report(
    db: AsyncSession, report_file: ReportFile, report_date: date, content: str
):

    # Create new report file object
    new_report = Report(
        report_file_id=ReportFile.id, report_date=report_date, content=content
    )

    # Add new object to database and commit
    db.add(new_report)
    await db.commit()
    await db.refresh(new_report)

    # Return new report object
    return new_report


async def update_report_by_date(db: AsyncSession, report_date: date, new_content: str):

    # Query to search and update report by report's date
    stmt = (
        update(Report)
        .where(Report.report_date == report_date)
        .values(content=new_content)
        .returning(Report)
    )

    # Execute query and commit changes to db
    result = await db.execute(stmt)
    updated_report = result.scalar_one_or_none()
    await db.commit()

    # Return updated report object
    return updated_report


async def get_report_by_date(db: AsyncSession, report_date: date):

    # Query to search report by report's date
    stmt = select(Report).filter(Report.report_date == report_date)

    # Execute query and fetch the result
    result = await db.execute(stmt)
    target_report = result.scalar_one_or_none()

    # Return found report object
    return target_report
