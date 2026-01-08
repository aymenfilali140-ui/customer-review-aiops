import json
import re
from typing import Any, Dict

import requests


# If your Ollama is not on localhost:11434, set OLLAMA_BASE_URL in your shell/env
OLLAMA_BASE_URL = (
    __import__("os").environ.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
)


def _strip_code_fences(s: str) -> str:
    s = s.strip()
    # Remove ```json ... ``` or ``` ... ```
    s = re.sub(r"^```(?:json)?\s*", "", s, flags=re.IGNORECASE)
    s = re.sub(r"\s*```$", "", s)
    return s.strip()


def _extract_json_object(s: str) -> str:
    """
    Best-effort: find the first '{' and the last '}' and return that slice.
    This handles cases where the model adds commentary before/after JSON.
    """
    s = s.strip()
    i = s.find("{")
    j = s.rfind("}")
    if i == -1 or j == -1 or j <= i:
        return s
    return s[i : j + 1]


def _cleanup_common_json_issues(s: str) -> str:
    """
    Minimal cleanup:
    - remove trailing commas before } or ]
    - normalize weird whitespace
    """
    s = re.sub(r",(\s*[}\]])", r"\1", s)
    return s.strip()


def call_ollama_json(model: str, prompt: str, timeout: int = 120) -> Dict[str, Any]:
    """
    Calls Ollama and returns a dict parsed from JSON.

    Uses Ollama's `format: "json"` to strongly encourage valid JSON output.
    Includes a single retry with stricter instructions if parsing fails.
    """
    url = f"{OLLAMA_BASE_URL}/api/generate"

    def _do_call(p: str) -> str:
        payload = {
            "model": model,
            "prompt": p,
            "stream": False,
            "format": "json",  # IMPORTANT: enforce JSON output
        }
        r = requests.post(url, json=payload, timeout=timeout)
        r.raise_for_status()
        data = r.json()

        # Ollama generate returns JSON with a "response" field containing the text output
        raw = data.get("response", "")
        return raw

    # First attempt
    raw = _do_call(prompt)
    text = _cleanup_common_json_issues(_extract_json_object(_strip_code_fences(raw)))

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Retry once with stricter instructions appended
        strict_prompt = (
            prompt
            + "\n\nSTRICT OUTPUT REQUIREMENT:\n"
              "- Return ONLY valid JSON.\n"
              "- No markdown, no code fences, no commentary.\n"
              "- Escape quotes inside strings properly.\n"
        )
        raw2 = _do_call(strict_prompt)
        text2 = _cleanup_common_json_issues(_extract_json_object(_strip_code_fences(raw2)))

        try:
            return json.loads(text2)
        except json.JSONDecodeError as e:
            # Save the bad payload for debugging (so you can see what the model produced)
            try:
                with open("ollama_bad_output.txt", "w", encoding="utf-8") as f:
                    f.write("=== RAW OUTPUT ===\n")
                    f.write(raw2)
                    f.write("\n\n=== EXTRACTED JSON CANDIDATE ===\n")
                    f.write(text2)
            except Exception:
                pass

            raise RuntimeError(
                "Ollama did not return valid JSON even after retry. "
                "Saved output to ollama_bad_output.txt for inspection."
            ) from e


def render_prompt(template_path, context: Dict[str, Any]) -> str:
    """
    Your repo already had this helper; keep it here if you previously used it.
    If your original file already uses Jinja2, keep your existing render_prompt.
    This placeholder assumes your existing analyzer imports it from here.
    """
    # If your project uses Jinja2, you likely already have a proper implementation.
    # Keep your original render_prompt implementation if you had one.
    from jinja2 import Template

    tmpl = Template(template_path.read_text(encoding="utf-8"))
    return tmpl.render(**context)
