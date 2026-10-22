from datetime import date
import os
import calendar
import shutil

import docx
from docx.enum.text import WD_ALIGN_PARAGRAPH
from pydantic.types import FilePath
from pydantic_settings.sources import DotEnvSettingsSource

from app.settings import settings
from app import helpers


def create_report_file(report_number: int, target_date: date): ...


def update_report_file(target_report_filename: str, target_date: date, content: str): ...