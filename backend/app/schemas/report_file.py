from datetime import date
from pydantic import BaseModel, ConfigDict
from app.schemas import ReportResponse


class ReportFileWithReportsResponse(BaseModel):
    id: int
    week_start: date
    filename: str
    model_config = ConfigDict(from_attributes=True)

    reports: list[ReportResponse]
