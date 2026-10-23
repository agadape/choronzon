"""How every devtool call reaches lightwalletd: over Tor by default.

lightwalletd sees the IP address of whoever connects to it. Over Tor it sees a Tor exit instead of the kiosk, the
listener or the Watcher. The devtool bundles a Tor client (Arti; no tor daemon, no sudo), so this is one flag per
network command (`--connection tor`). Its state and directory cache live in `<wallet dir>/tor/` (gitignored with
the wallets; a kiosk session's goes when the session is closed).

Precedence: an explicit `--connection` option > the LWD_CONNECTION environment variable > the default. The default
is `tor`, except on a GitHub Actions runner (GITHUB_ACTIONS=true): the scheduled publisher renders from the public
key on a GitHub machine, whose IP protects nobody, and Tor there would only add flakiness.

Fail closed: if Tor cannot connect, the command fails. Nothing here, nor in the devtool, falls back to a direct
connection. Going direct is a deliberate operator choice (`--connection direct` or LWD_CONNECTION=direct).
What Tor does not hide: timing (when a transaction appears on chain), and what a wallet stores about itself.
"""
from __future__ import annotations

import os

ENV = "LWD_CONNECTION"
CHOICES = ("tor", "direct")
DEFAULT = "tor"
# devtool wallet subcommands that open a connection to lightwalletd (all accept --connection)
NETWORK_COMMANDS = frozenset({"sync", "enhance", "send", "pay", "init", "init-fvk", "get-info"})


def default_connection(environ=None) -> str:
    env = os.environ if environ is None else environ
    value = env.get(ENV, "").strip().lower()
    if value:
        return check(value)
    return "direct" if env.get("GITHUB_ACTIONS") == "true" else DEFAULT


def check(value: str) -> str:
    if value not in CHOICES:
        raise ValueError(f"connection must be one of {', '.join(CHOICES)}, not {value!r} ({ENV})")
    return value


def args_for(command: str, connection: str) -> list[str]:
    """The extra devtool arguments for one wallet subcommand: `--connection X` for network commands, else none."""
    return ["--connection", check(connection)] if command in NETWORK_COMMANDS else []


def failure_hint(connection: str) -> str:
    """Appended to a failed network command's message: never retry direct silently, tell the operator how."""
    if connection != "tor":
        return ""
    return (" [over Tor: if Tor cannot connect from here, rerun deliberately with --connection direct "
            f"(or {ENV}=direct); lightwalletd will then see this machine's IP address]")


def describe(connection: str) -> str:
    """One line for the operator: what lightwalletd got to see of this machine."""
    if check(connection) == "tor":
        return "route to lightwalletd: Tor (the server sees a Tor exit address, not this machine's)"
    return "route to lightwalletd: DIRECT (the server sees this machine's IP address)"


def add_argument(parser) -> None:
    """The shared CLI option for kiosk and renderer commands."""
    parser.add_argument("--connection", choices=CHOICES, default=None,
                        help=f"how to reach lightwalletd: tor (default; ${ENV} overrides) or direct "
                             f"(lightwalletd then sees this machine's IP)")


def resolve(cli_value: str | None) -> str:
    return check(cli_value) if cli_value else default_connection()
