import json
import asyncio
from datetime import datetime
from app.database import async_session
from app import models

report_files = {}


with open("app/reports.json", "r") as json_file:
        report_files = json.load(json_file)

objects_to_create = []


async def create_report_files():
    async with async_session.begin() as session:
        try:
            idx = 1
            for report_filename, report_file_data in report_files.items():
                new_report_file = models.ReportFile(
                    id=idx,
                    filename=report_filename,
                    week_start=datetime.strptime(report_file_data.get("week_start"), "%d.%m.%Y").date()
                )
                session.add(new_report_file)

                for report_date, report_content in report_file_data.get("reports").items():
                    new_report = models.Report(
                        report_file_id = new_report_file.id,
                        report_date=datetime.strptime(report_date, "%d.%m.%Y").date(),
                        content=report_content
                    )

                    session.add(new_report)
                idx += 1


        finally:
            await session.close()


if __name__ == "__main__":
    asyncio.run(create_report_files())
