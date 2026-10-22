from datetime import date, timedelta
import shutil

def get_week_bounds(target_date: date):

    week_start = target_date - timedelta(days=target_date.weekday())
    week_end = week_start + timedelta(days=4)

    return week_start, week_end


def new_report_file_from_template(source: str, target: str) -> str:
    return shutil.copy(source, target)
