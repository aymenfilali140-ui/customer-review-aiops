import json
from typing import Any, Dict, Optional
import requests
from jinja2 import Template
from pathlib import Path

OLLAMA_URL = "http://localhost:11434/api/generate"


def render_prompt(template_path: Path, context: Dict[str, Any]) -> str:
    template = Template(template_path.read_text(encoding="utf-8"))
    return template.render(**context)


def call_ollama_json(model: str, prompt: str, timeout_s: int = 60) -> Dict[str, Any]:
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "format": "json",
        "options": {
            "temperature": 0.2
        },
    }
    r = requests.post(OLLAMA_URL, json=payload, timeout=(5, timeout_s))  # (connect, read)
    r.raise_for_status()
    data = r.json()
    raw = data.get("response", "").strip()
    return json.loads(raw)
