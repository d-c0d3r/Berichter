from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path

import docx
from sqlalchemy.ext.asyncio import AsyncSession

from app import models
from app.helpers import get_week_bounds
from app.settings import settings


WEEKDAYS = {
    "montag": 0,
    "dienstag": 1,
    "mittwoch": 2,
    "donnerstag": 3,
    "freitag": 4,
}


@dataclass(frozen=True)
class ImportResult:
    source_files: int
    report_files_created: int
    reports_created: int


def clean_content(text: str) -> str:
    """Убирает пустые строки, сохраняя переносы между пунктами."""
    return "\n".join(line.strip() for line in text.splitlines() if line.strip())


def read_old_report_file(filepath: Path) -> dict[date, str]:
    """
    Читает старый DOCX.

    Возвращает:
        {дата рабочего дня: непустой текст}
    """
    document = docx.Document(str(filepath))

    # Ищем таблицу по заголовкам старой формы.
    candidates = []

    for table in document.tables:
        for row_index, row in enumerate(table.rows):
            labels = [cell.text.strip().casefold() for cell in row.cells]

            if all(label in labels for label in ("von", "jahr", "kw")):
                candidates.append((table, row_index, labels))

    if len(candidates) != 1:
        raise ValueError(
            f"{filepath.name}: ожидалась одна таблица старого "
            f"формата, найдено: {len(candidates)}"
        )

    table, labels_row_index, labels = candidates[0]

    if labels_row_index == 0:
        raise ValueError(f"{filepath.name}: нет строки со значениями шапки")

    # В старой форме значения находятся над названиями полей.
    values = table.rows[labels_row_index - 1].cells

    start_text = values[labels.index("von")].text.strip()
    year_text = values[labels.index("jahr")].text.strip()
    week_text = values[labels.index("kw")].text.strip()

    try:
        period_start = datetime.strptime(
            f"{start_text.rstrip('.')}.{year_text}",
            "%d.%m.%Y",
        ).date()

        source_week_number = int(week_text)
    except ValueError as exc:
        raise ValueError(
            f"{filepath.name}: не удалось прочитать дату или номер недели из шапки"
        ) from exc

    if period_start.isocalendar().week != source_week_number:
        raise ValueError(
            f"{filepath.name}: дата {period_start:%d.%m.%Y} "
            f"не соответствует KW {source_week_number}"
        )

    week_start, _ = get_week_bounds(period_start)

    reports: dict[date, str] = {}
    seen_weekdays: set[int] = set()

    for row in table.rows:
        day_name = " ".join(row.cells[0].text.split()).casefold()

        if day_name not in WEEKDAYS:
            continue

        weekday = WEEKDAYS[day_name]

        if weekday in seen_weekdays:
            raise ValueError(f"{filepath.name}: повторяется строка {day_name}")

        seen_weekdays.add(weekday)

        if len(row.cells) < 2:
            raise ValueError(
                f"{filepath.name}: нет ячейки с текстом для дня {day_name}"
            )

        content = clean_content(row.cells[1].text)

        if not content:
            continue

        report_date = week_start + timedelta(days=weekday)
        reports[report_date] = content

    if seen_weekdays != set(range(5)):
        raise ValueError(f"{filepath.name}: не найдены все пять строк рабочих дней")

    return reports


async def import_reports_directory(
    db: AsyncSession,
    directory: str | Path,
    *,
    start_date: date = date(2025, 8, 1),
    end_date: date | None = None,
    first_report_number: int = 1,
) -> ImportResult:
    """
    Импортирует старые DOCX из директории.

    Для каждой недели периода создаёт ReportFile.
    Для непустых рабочих дней создаёт Report.

    DOCX-файлы не создаёт и не изменяет.
    Commit выполняет вызывающий код.
    """
    directory = Path(directory)
    end_date = end_date if end_date is not None else date.today()

    if not directory.is_dir():
        raise NotADirectoryError(directory)

    if end_date < start_date:
        raise ValueError("end_date не может быть раньше start_date")

    if first_report_number < 1:
        raise ValueError("first_report_number должен быть >= 1")

    source_files = sorted(
        (
            path
            for path in directory.iterdir()
            if path.is_file()
            and path.suffix.lower() == ".docx"
            and not path.name.startswith("~$")
        ),
        key=lambda path: path.name.casefold(),
    )

    # Сначала читаем все документы.
    # До завершения чтения записи в БД не добавляются.
    imported_reports: dict[date, str] = {}
    report_sources: dict[date, Path] = {}

    for filepath in source_files:
        daily_reports = read_old_report_file(filepath)

        for report_date, content in daily_reports.items():
            if not start_date <= report_date <= end_date:
                continue

            if report_date in imported_reports:
                previous_file = report_sources[report_date]

                raise ValueError(
                    f"Дата {report_date:%d.%m.%Y} встречается "
                    f"в двух файлах: {previous_file.name} "
                    f"и {filepath.name}"
                )

            imported_reports[report_date] = content
            report_sources[report_date] = filepath

    # Создаём запись файла для каждой недели,
    # включая полностью пустые.
    first_week_start, _ = get_week_bounds(start_date)
    last_week_start, _ = get_week_bounds(end_date)

    report_files_created = 0
    reports_created = 0

    week_start = first_week_start
    report_number = first_report_number

    while week_start <= last_week_start:
        _, week_end = get_week_bounds(week_start)

        report_file = models.ReportFile(
            week_start=week_start,
            filename=settings.BERICHTSHEFT_BASE_FILENAME.format(
                report_number=report_number,
                week_start=week_start.strftime("%d.%m.%Y"),
                week_end=week_end.strftime("%d.%m.%Y"),
            ),
        )
        db.add(report_file)

        # Связываем через relationship:
        # report_file.id вручную получать не требуется.
        for weekday in range(5):
            report_date = week_start + timedelta(days=weekday)
            content = imported_reports.get(report_date)

            if not content:
                continue

            report = models.Report(
                report_date=report_date,
                content=content,
                report_file=report_file,
            )
            db.add(report)
            reports_created += 1

        report_files_created += 1
        report_number += 1
        week_start += timedelta(days=7)

    await db.flush()

    return ImportResult(
        source_files=len(source_files),
        report_files_created=report_files_created,
        reports_created=reports_created,
    )
