from datetime import date
from pydantic import BaseModel


class ReportFileResponse(BaseModel):
    id: int
    week_start: date
    filename: str
