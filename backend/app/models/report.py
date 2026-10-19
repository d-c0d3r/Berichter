from sqlalchemy import Integer, Date, Text, String, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.orm.decl_api import declarative_base

from app.database import Base

from datetime import date
from typing import TYPE_CHECKING


if TYPE_CHECKING:
    from . import ReportFile


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, unique=True, nullable=False)
    report_date: Mapped[date] = mapped_column(Date, unique=True, nullable=False)
    content: Mapped[str] = mapped_column(Text, unique=False, nullable=False)

    report_file_id: Mapped[int] = mapped_column(ForeignKey("report_files.id", ondelete="RESTRICT"))
    report_file: Mapped["ReportFile"] = relationship(back_populates="reports")
