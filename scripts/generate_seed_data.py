"""Generate relative-date demo data for previewing or importing Planora fixtures."""

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path


def due_in(days: int, hour: int = 17) -> str:
    value = datetime.now(timezone.utc) + timedelta(days=days)
    return value.replace(hour=hour, minute=0, second=0, microsecond=0).isoformat()


items = [
    {"title": "Submit research proposal", "kind": "deadline", "due_at": due_in(2, 23), "priority": "high"},
    {"title": "Prepare presentation slides", "kind": "task", "due_at": due_in(5, 14), "priority": "medium"},
    {"title": "Renew library books", "kind": "deadline", "due_at": due_in(-2), "priority": "high"},
]

target = Path(__file__).with_name("seed-preview.json")
target.write_text(json.dumps(items, indent=2), encoding="utf-8")
print(f"Created {target} with {len(items)} relative-date demo items.")
