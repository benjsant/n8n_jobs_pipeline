"""Client LLM — DeepSeek via l'API compatible OpenAI (langchain-openai)."""
from __future__ import annotations

import os

from langchain_openai import ChatOpenAI


def get_llm(temperature: float = 0.7) -> ChatOpenAI:
    """Renvoie un ChatOpenAI pointé sur DeepSeek, en mode JSON strict.

    Variables d'env (mêmes que le reste du projet) :
      DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL (défaut https://api.deepseek.com),
      DEEPSEEK_MODEL (défaut deepseek-chat).
    """
    return ChatOpenAI(
        model=os.environ.get("DEEPSEEK_MODEL", "deepseek-chat"),
        base_url=os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
        api_key=os.environ.get("DEEPSEEK_API_KEY", "sk-missing"),
        temperature=temperature,
        model_kwargs={"response_format": {"type": "json_object"}},
    )
