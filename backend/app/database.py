from sqlalchemy import MetaData
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from typing import Annotated
from fastapi import Depends

from app.settings import settings



NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_`%(constraint_name)s`",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    """Adds base necessary to all the models and specifies table attributes such as a table name etc."""

    metadata = MetaData(naming_convention=NAMING_CONVENTION)


engine = create_async_engine(settings.DATABASE_URL, echo=True)
async_session = async_sessionmaker(engine, expire_on_commit=False)


async def get_async_db_session():

    async with async_session.begin() as session:
        try:
            yield session
        finally:
            await session.commit()

GetAsyncDBSessionDependency = Annotated[AsyncSession, Depends(get_async_db_session)]
