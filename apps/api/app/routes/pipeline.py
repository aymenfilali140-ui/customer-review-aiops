from __future__ import annotations

from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal, Optional, Dict
import subprocess
import sys
import uuid
import threading

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, Field

router = APIRouter()

# Where we write logs
LOG_DIR = Path(".pipeline_runs")
LOG_DIR.mkdir(exist_ok=True)

JobState = Literal["queued", "running", "succeeded", "failed"]


@dataclass
class Job:
    id: str
    state: JobState
    created_at: str
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    return_code: Optional[int] = None
    error: Optional[str] = None
    log_file: Optional[str] = None


_JOBS: Dict[str, Job] = {}
_LOCK = threading.Lock()


class RunPipelineReq(BaseModel):
    vertical: str = Field(default="food", description="Vertical to ingest")
    pages: int = Field(default=2, ge=1, le=50)
    count: int = Field(default=200, ge=1, le=5000)
    batch: int = Field(default=50, ge=1, le=500)


class RunPipelineResp(BaseModel):
    job_id: str


class JobResp(BaseModel):
    id: str
    state: JobState
    created_at: str
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    return_code: Optional[int] = None
    error: Optional[str] = None
    log_tail: str = ""


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _tail(path: Path, n: int = 200) -> str:
    try:
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
        return "\n".join(lines[-n:])
    except Exception:
        return ""


def _run_and_log(cmd: list[str], log_path: Path) -> int:
    with log_path.open("a", encoding="utf-8") as f:
        f.write("\n$ " + " ".join(cmd) + "\n")
        f.flush()
        p = subprocess.Popen(cmd, stdout=f, stderr=subprocess.STDOUT)
        return p.wait()


def _pipeline_worker(job_id: str, req: RunPipelineReq) -> None:
    log_path = LOG_DIR / f"{job_id}.log"

    with _LOCK:
        job = _JOBS[job_id]
        job.state = "running"
        job.started_at = _utc_now()
        job.log_file = str(log_path)

    try:
        # 1) ingest (google play)
        rc1 = _run_and_log(
            [
                sys.executable,
                "-m",
                "jobs.ingest.run_ingest",
                "--vertical",
                req.vertical,
                "--pages",
                str(req.pages),
                "--count",
                str(req.count),
            ],
            log_path,
        )
        if rc1 != 0:
            raise RuntimeError(f"Ingest failed (return code {rc1}). See log.")

        # 2) analyze (ollama)
        rc2 = _run_and_log(
            [
                sys.executable,
                "-m",
                "jobs.analyze.analyzer",
                "--batch",
                str(req.batch),
            ],
            log_path,
        )
        if rc2 != 0:
            raise RuntimeError(f"Analyze failed (return code {rc2}). See log.")

        with _LOCK:
            job = _JOBS[job_id]
            job.state = "succeeded"
            job.finished_at = _utc_now()
            job.return_code = 0

    except Exception as e:
        with _LOCK:
            job = _JOBS[job_id]
            job.state = "failed"
            job.finished_at = _utc_now()
            job.return_code = 1
            job.error = str(e)


@router.post("/pipeline/run", response_model=RunPipelineResp)
def run_pipeline(req: RunPipelineReq, bg: BackgroundTasks) -> RunPipelineResp:
    job_id = uuid.uuid4().hex
    job = Job(
        id=job_id,
        state="queued",
        created_at=_utc_now(),
    )
    with _LOCK:
        _JOBS[job_id] = job

    bg.add_task(_pipeline_worker, job_id, req)
    return RunPipelineResp(job_id=job_id)


@router.get("/pipeline/jobs/{job_id}", response_model=JobResp)
def get_job(job_id: str) -> JobResp:
    with _LOCK:
        job = _JOBS.get(job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    log_tail = ""
    if job.log_file:
        log_tail = _tail(Path(job.log_file), n=200)

    payload = asdict(job)
    payload["log_tail"] = log_tail
    return JobResp(**payload)
