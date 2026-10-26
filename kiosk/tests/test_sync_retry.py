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


@pytest.mark.parametrize("method,args", [("pay", ("zcash:?address=x",)), ("send", ("utest1x", 1000, "memo"))])
def test_send_and_pay_are_never_retried(monkeypatch, tmp_path, method, args):
    """Through the public methods: a pay/send that switched to _run_read (and so retried) must fail this test."""
    calls = _flaky(monkeypatch, 1)
    monkeypatch.setattr(dt.Devtool, "account", lambda self: "00000000-0000-0000-0000-000000000000")
    d = dt.Devtool(tmp_path, identity=tmp_path / "x.age", connection="tor")
    with pytest.raises(dt.DevtoolError):
        getattr(d, method)(*args)
    assert calls == [(method, "tor")]


def test_the_send_test_would_catch_a_retrying_pay(monkeypatch, tmp_path):
    """The guard above is not vacuous: a pay routed through _run_read is retried, and the call count shows it."""
    calls = _flaky(monkeypatch, 1)
    monkeypatch.setattr(dt.Devtool, "account", lambda self: "00000000-0000-0000-0000-000000000000")
    d = dt.Devtool(tmp_path, identity=tmp_path / "x.age", connection="tor")
    d._run_read("pay", "x")
    assert len(calls) == 2
