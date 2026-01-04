from datetime import datetime, timezone
import subprocess
import sys

def run(cmd: list[str]) -> None:
    print("\n$ " + " ".join(cmd))
    p = subprocess.run(cmd)
    if p.returncode != 0:
        raise SystemExit(p.returncode)

def main():
    started = datetime.now(timezone.utc)
    print(f"Pipeline start: {started.isoformat()}")

    # 1) ingest (google play)
    run([sys.executable, "-m", "jobs.ingest.run_ingest", "--vertical", "food", "--pages", "2", "--count", "200"])

    # 2) analyze (ollama)
    run([sys.executable, "-m", "jobs.analyze.analyzer", "--batch", "50"])

    finished = datetime.now(timezone.utc)
    print(f"Pipeline finished: {finished.isoformat()}")

if __name__ == "__main__":
    main()
