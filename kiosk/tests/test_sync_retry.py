"""sync/enhance are retried over the same route; send/pay never are."""
import pytest

from kiosk import devtool as dt


def _flaky(monkeypatch, fail_times):
    calls = []

    def fake_run(self, *args, **kw):
        calls.append((args[0], self.connection))
        if len(calls) <= fail_times:
            raise dt.DevtoolError("devtool sync exit 1: stream closed because of a broken pipe")
        return ""

    monkeypatch.setattr(dt.Devtool, "_run", fake_run)
    monkeypatch.setattr(dt.Devtool, "READ_PAUSE_S", 0)
    return calls


def test_sync_retries_over_the_same_route(monkeypatch, tmp_path):
    calls = _flaky(monkeypatch, 2)
    d = dt.Devtool(tmp_path, connection="tor")
    d.sync()
    assert calls == [("sync", "tor")] * 3


def test_sync_gives_up_after_three(monkeypatch, tmp_path):
    calls = _flaky(monkeypatch, 5)
    with pytest.raises(dt.DevtoolError):
        dt.Devtool(tmp_path, connection="tor").enhance()
    assert len(calls) == 3


def test_send_is_never_retried(monkeypatch, tmp_path):
    calls = _flaky(monkeypatch, 1)
    d = dt.Devtool(tmp_path, connection="tor")
    with pytest.raises(dt.DevtoolError):
        d._run("pay", "x")
    assert len(calls) == 1
