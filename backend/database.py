from sqlalchemy import MetaData
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.engine import create_engine
from settings import settings

metadata = MetaData()
Base = declarative_base(metadata=metadata)
engine = create_engine(settings.DATABASE_URL)


def init_db():
    metadata.create_all(engine)

    with sessionmaker(bind=engine)() as session:
        try:
            session.begin()
            yield session
        finally:
            session.close()
