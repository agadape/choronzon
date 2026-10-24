"""`renderer whisper`: the whisper text never comes from the command line (shell history, `ps`)."""
import io

import pytest

from renderer import __main__ as cli


def test_text_on_the_command_line_is_refused_before_any_wallet_is_opened(tmp_path, capsys):
    with pytest.raises(SystemExit) as e:
        cli.main(["whisper", "0" * 64, "--wallet", str(tmp_path / "no-such-wallet"), "--text", "my whisper"])
    msg = str(e.value.code)
    assert msg.startswith("refusing --text") and "shell history" in msg and "--text-file" in msg
    assert "my whisper" not in msg + capsys.readouterr().err


class _Args:
    def __init__(self, text_file=None):
        self.text_file = text_file


def test_whisper_text_from_file_stdin_or_default(tmp_path, monkeypatch):
    f = tmp_path / "w.txt"
    f.write_text("  from a file\n", encoding="utf-8")
    assert cli._whisper_text(_Args(str(f))) == "from a file"
    monkeypatch.setattr("sys.stdin", io.StringIO("from a pipe\n"))
    assert cli._whisper_text(_Args()) == "from a pipe"
    monkeypatch.setattr("sys.stdin", io.StringIO(""))
    assert cli._whisper_text(_Args()) == cli.DEFAULT_WHISPER == "you are not alone."
