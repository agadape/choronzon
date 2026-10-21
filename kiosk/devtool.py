"""Thin wrapper around bin/devtool-aegis for the kiosk. Output is parsed, never echoed: it contains addresses.

Only the patched build can broadcast on NU7 testnet. Every command takes the wallet directory; spend commands
also take the age identity file that decrypts the wallet's mnemonic.
"""
from __future__ import annotations

import re
import subprocess
from dataclasses import dataclass
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
DEFAULT_DEVTOOL = REPO / "bin" / "devtool-aegis"
_UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
_UA = re.compile(r"\b(?:zu|tu|u)(?:test)?1[0-9a-z]{60,}\b")
_TXID = re.compile(r"^[0-9a-f]{64}$", re.M)
_HEIGHT = re.compile(r"Height: (\d+)")
_SPENDABLE = re.compile(r"ironwood_balance: Balance \{\s*spendable_value: Zatoshis\(\s*(\d+)")
_MEMO = re.compile(r"memo(\.\d+)?=[^&\s\"']*")


def sanitize(line: str) -> str:
    """An error line with every address and every memo value removed (a parse error could echo the whole URI)."""
    return _MEMO.sub(r"memo\1=<memo>", _UA.sub("<address>", line))


class DevtoolError(RuntimeError):
    """The devtool failed. The message carries the exit code and a sanitized last line, never an address."""


@dataclass(frozen=True)
class Devtool:
    wallet_dir: Path
    identity: Path | None = None
    binary: Path = DEFAULT_DEVTOOL
    server: str = "zecrocks"
    network: str = "test"

    def _run(self, *args: str, stdin: str | None = None, timeout: int = 900) -> str:
        done = subprocess.run([str(self.binary), "wallet", "-w", str(self.wallet_dir), *args],
                              input=stdin, capture_output=True, text=True, timeout=timeout)
        if done.returncode != 0:
            tail = (done.stderr.strip().splitlines() or done.stdout.strip().splitlines() or [""])[-1]
            raise DevtoolError(f"devtool {args[0]} exit {done.returncode}: {sanitize(tail)[:200]}")
        return done.stdout + done.stderr

    def _spend_args(self) -> list[str]:
        if self.identity is None:
            raise DevtoolError("this wallet has no identity file; spending is not possible")
        return ["-i", str(self.identity)]

    # --- read-only ------------------------------------------------------------------------------------------------

    def account(self) -> str:
        m = _UUID.search(self._run("list-accounts"))
        if not m:
            raise DevtoolError("no account in wallet")
        return m.group(0)

    def full_viewing_key(self) -> tuple[str, int]:
        """The account's unified full viewing key and birthday height. Publishing it is a deliberate act (M5)."""
        out = self._run("list-accounts")
        key = re.search(r"UFVK: (uv[a-z]*1[0-9a-z]+)", out)
        birthday = re.search(r"birthday height (\d+)", out)
        if not key or not birthday:
            raise DevtoolError("no full viewing key in wallet")
        return key.group(1), int(birthday.group(1))

    def default_address(self) -> str:
        m = _UA.search(self._run("list-addresses"))
        if not m:
            raise DevtoolError("no unified address in wallet")
        return m.group(0)

    def height(self) -> int:
        m = _HEIGHT.search(self._run("balance"))
        return int(m.group(1)) if m else 0

    def spendable_zat(self) -> int:
        m = _SPENDABLE.search(self._run("balance"))
        return int(m.group(1)) if m else 0

    def sync(self) -> None:
        self._run("sync", "-s", self.server)

    def enhance(self) -> None:
        self._run("enhance", "-s", self.server)

    # --- state-changing ----------------------------------------------------------------------------------------------

    def init(self, name: str, birthday: int | None = None) -> None:
        args = ["init", "--name", name, "-i", str(self.identity), "-n", self.network, "-s", self.server]
        if birthday is not None:
            args += ["--birthday", str(birthday)]
        self._run(*args)

    def generate_address(self) -> str:
        """A fresh diversified address of this wallet (unlinkable to its other addresses without its keys)."""
        m = _UA.search(self._run("generate-address", self.account()))
        if not m:
            raise DevtoolError("generate-address returned no address")
        return m.group(0)

    def pay(self, payment_uri: str) -> str:
        """Broadcast a ZIP-321 payment (1..n outputs); returns the txid in display order."""
        out = self._run("pay", self.account(), *self._spend_args(), "--payment-uri", payment_uri, "-s", self.server,
                        stdin="y\n")
        m = _TXID.search(out)
        if not m:
            raise DevtoolError("pay printed no txid")
        return m.group(0)

    def send(self, address: str, value_zat: int, memo: str | None = None) -> str:
        args = ["send", self.account(), *self._spend_args(), "--address", address, "--value", str(value_zat),
                "-s", self.server]
        if memo is not None:
            args += ["--memo", memo]
        m = _TXID.search(self._run(*args, stdin="y\n"))
        if not m:
            raise DevtoolError("send printed no txid")
        return m.group(0)
