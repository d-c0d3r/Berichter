from datetime import date, timedelta
import zipfile
import shutil
import os
from app.settings import settings


def get_week_bounds(target_date: date):

    week_start = target_date - timedelta(days=target_date.weekday())
    week_end = week_start + timedelta(days=4)

    return week_start, week_end


def new_report_file_from_template(source: str, target: str) -> str:
    return shutil.copy(source, target)


def report_files_to_zip(files: list[str]):

    zip_filename = f"berichter-export-{date.today().strftime("%d-%m-%Y")}.zip"
    zip_filepath = os.path.join(settings.REPORTS_DIRECTORY, zip_filename)

    with zipfile.ZipFile(file=zip_filepath, compression=zipfile.ZIP_DEFLATED, mode="w") as zip_file:
        for file in files:
            zip_file.write(file)

    return zip_filepath
