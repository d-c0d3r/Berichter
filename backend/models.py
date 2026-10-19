from datetime import date

from sqlalchemy import Integer, Date, Text, String, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.orm.decl_api import declarative_base
from database import Base


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, unique=True, nullable=False)
    report_date: Mapped[date] = mapped_column(Date, unique=True, nullable=False)
    content: Mapped[str] = mapped_column(Text, unique=False, nullable=False)

    report_file_id: Mapped[int] = mapped_column(ForeignKey("report_files.id", ondelete="RESTRICT"))
    report_file: Mapped["ReportFile"] = relationship(back_populates="reports")

class ReportFile(Base):
    __tablename__ = "report_files"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, unique=True, nullable=False)
    week_start: Mapped[date] = mapped_column(Date, unique=True, nullable=False)
    filename: Mapped[str] = mapped_column(String, unique=True, nullable=False)

    reports: Mapped[list[Report]] = relationship(back_populates="report_file")
