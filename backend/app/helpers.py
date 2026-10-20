from datetime import date, timedelta


def get_week_bounds(target_date: date):

    week_start = target_date - timedelta(target_date.weekday())
    week_end = week_start + timedelta(days=4)

    return week_start, week_end
