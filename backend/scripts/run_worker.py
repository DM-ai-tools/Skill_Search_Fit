"""Run Arq worker for durable background jobs."""

from __future__ import annotations

import logging

from arq.cli import run_worker

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

if __name__ == "__main__":
    logger.info("Starting SkillSearchFit Arq worker")
    run_worker("app.jobs.arq_worker.WorkerSettings")
