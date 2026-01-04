from fastapi import APIRouter
import yaml
from pathlib import Path

router = APIRouter()

@router.get("/config/verticals")
def get_verticals():
    path = Path("packages/shared/verticals.yml")
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    return data
