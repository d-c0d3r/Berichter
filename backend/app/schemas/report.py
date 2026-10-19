from datetime import date
from pydantic import BaseModel


class ReportResponse(BaseModel):
    id: int
    report_date: date
    content: str
