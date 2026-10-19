from sqlalchemy import Integer, Date, Text, String, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.orm.decl_api import declarative_base

from app.database import Base

from datetime import date
from typing import TYPE_CHECKING


if TYPE_CHECKING:
    from . import Report


class ReportFile(Base):
    __tablename__ = "report_files"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, unique=True, nullable=False)
    week_start: Mapped[date] = mapped_column(Date, unique=True, nullable=False)
    filename: Mapped[str] = mapped_column(String, unique=True, nullable=False)

    reports: Mapped[list["Report"]] = relationship(back_populates="report_file")
