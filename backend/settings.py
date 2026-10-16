from pydantic_settings import BaseSettings, SettingsConfigDict
import ollama

class BerichterSettings(BaseSettings):

    OLLAMA_URL: str
    DATABASE_URL: str

    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8')


settings = BerichterSettings() # type: ignore
OLLAMA_CLIENT = ollama.AsyncClient(settings.OLLAMA_URL)
