from pydantic_settings import BaseSettings, SettingsConfigDict
import ollama


class BerichterSettings(BaseSettings):
    OLLAMA_URL: str
    DATABASE_URL: str
    FULL_USER_NAME: str
    BERICHTER_MODEL: str
    REPORTS_DIRECTORY: str
    TEMPLATE_REPORT_FILENAME: str
    BERICHTSHEFT_BASE_FILENAME: str
    OLLAMA_CONNECTION: ollama.AsyncClient | None = None

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = BerichterSettings()  # type: ignore
