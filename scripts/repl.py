#!/usr/bin/env python3
"""Interactive chat REPL for NanoClaw — connects to the CLI socket and keeps the conversation going."""

import json
import os
import select
import signal
import socket
import sys
import threading
from pathlib import Path

NANOCLAW_DIR = Path(__file__).resolve().parent.parent
SOCK_PATH = NANOCLAW_DIR / "data" / "cli.sock"
SILENCE_MS = 2.0   # seconds of quiet after last chunk before showing next prompt
HARD_TIMEOUT = 120  # seconds to wait for first reply

def connect() -> socket.socket:
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    try:
        s.connect(str(SOCK_PATH))
    except (FileNotFoundError, ConnectionRefusedError):
        print(f"Cannot connect to NanoClaw at {SOCK_PATH}.", file=sys.stderr)
        print("Is the service running? (launchctl list | grep nanoclaw)", file=sys.stderr)
        sys.exit(1)
    return s

def recv_response(s: socket.socket) -> str:
    """Read response lines until SILENCE_MS of quiet after the first chunk."""
    parts = []
    buf = b""
    first = True
    timeout = HARD_TIMEOUT if first else SILENCE_MS

    while True:
        ready, _, _ = select.select([s], [], [], timeout)
        if not ready:
            if first:
                print("\n[no reply — check logs/nanoclaw.log]", file=sys.stderr)
                return ""
            break
        chunk = s.recv(4096)
        if not chunk:
            break
        buf += chunk
        while b"\n" in buf:
            line, buf = buf.split(b"\n", 1)
            line = line.strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
                if isinstance(msg.get("text"), str):
                    parts.append(msg["text"])
                    first = False
                    timeout = SILENCE_MS  # switch to silence timeout after first chunk
            except json.JSONDecodeError:
                pass

    return "\n".join(parts)

def main():
    signal.signal(signal.SIGINT, lambda *_: (print(), sys.exit(0)))

    print(f"Nano  (Ctrl+C or Ctrl+D to quit)\n")

    s = connect()

    while True:
        try:
            user_input = input("You: ").strip()
        except EOFError:
            print()
            break
        if not user_input:
            continue

        s.sendall((json.dumps({"text": user_input}) + "\n").encode())
        reply = recv_response(s)
        if reply:
            print(f"\nNano: {reply}\n")

    s.close()

if __name__ == "__main__":
    main()
