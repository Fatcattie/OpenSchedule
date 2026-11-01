import json

import pytest
from pydantic import ValidationError

from app.routers.decompose import _format_sse
from app.schemas.decompose import DecomposeRequest
from app.services.callback_delivery import callback_delay_seconds


def test_decompose_request_rejects_coercible_numeric_values():
    with pytest.raises(ValidationError):
        DecomposeRequest(
            tenant_id="tenant-1",
            project_id="project-1",
            description="break down this plan",
            constraints={"people": "2"},
        )


def test_decompose_request_accepts_strict_contract():
    request = DecomposeRequest(
        tenant_id="tenant-1",
        project_id="project-1",
        description="break down this plan",
        constraints={"people": 2, "budget_hours": 12.5},
    )
    assert request.constraints.people == 2
    assert request.constraints.budget_hours == 12.5


def test_sse_frame_has_event_and_json_data_lines():
    rendered = _format_sse({"event": "ai.start", "data": {"run_id": "run-1"}})
    lines = rendered.splitlines()
    assert lines[0] == "event: ai.start"
    assert json.loads(lines[1].removeprefix("data: ")) == {"run_id": "run-1"}
    assert rendered.endswith("\n\n")


def test_callback_retry_backoff_is_bounded():
    assert callback_delay_seconds(1) == 1
    assert callback_delay_seconds(2) == 2
    assert callback_delay_seconds(10) == 8
