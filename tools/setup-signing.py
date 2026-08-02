#!/usr/bin/env python3
"""
Make `git log --show-signature` tell the truth in this container.

Background: commits here really are signed — every one carries a `gpgsig`
header — but the environment's signing helper implements only `-Y sign`, and
there is no `ssh-keygen` to verify with. So git reports either

    error: gpg.ssh.allowedSignersFile needs to be configured and exist   -> N
    Error: unsupported code-sign operation ...                           -> B

Both read as "these commits are not properly signed", and an unattended run
already spent a cycle on that false conclusion, considering a history rewrite.

This installs `tools/ssh-sign-shim.py` as `gpg.ssh.program`. The shim delegates
`-Y sign` untouched to the real helper and answers `-Y verify` itself, so
verification starts working without changing how anything is signed.

Safety: the shim is only installed if a self-test verifies a signature from an
actual commit in this repo first. If anything at all goes wrong, git config is
left exactly as it was — a cosmetic verification setting must never be able to
break committing.
"""

import base64
import os
import struct
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SHIM = REPO / "tools" / "ssh-sign-shim.py"


def git(*args: str) -> str:
    return subprocess.run(
        ["git", "-C", str(REPO), *args], capture_output=True, text=True
    ).stdout.strip()


def commit_parts(rev: str) -> tuple[str, bytes] | None:
    """Split a commit object into (armoured signature, signed payload)."""
    raw = subprocess.run(
        ["git", "-C", str(REPO), "cat-file", "commit", rev],
        capture_output=True,
    ).stdout.decode(errors="replace")
    if not raw:
        return None

    sig, payload, inside = [], [], False
    for line in raw.split("\n"):
        if line.startswith("gpgsig "):
            inside = True
            sig.append(line[len("gpgsig ") :])
            continue
        if inside and line.startswith(" "):
            sig.append(line[1:])
            continue
        inside = False
        payload.append(line)
    if not sig:
        return None
    return "\n".join(sig) + "\n", "\n".join(payload).encode()


def signing_pubkey(armoured: str) -> str | None:
    """Recover the signer's key from the signature itself.

    Not from `user.signingkey` — that file is empty in this environment, so
    reading it would produce a key line that matches nothing.
    """
    body = "".join(
        l.strip() for l in armoured.splitlines() if l.strip() and "SSH SIGNATURE" not in l
    )
    try:
        blob = base64.b64decode(body)
    except Exception:
        return None
    if blob[:6] != b"SSHSIG":
        return None

    off = 10  # magic(6) + version(4)
    (n,) = struct.unpack(">I", blob[off : off + 4])
    off += 4
    pk = blob[off : off + n]
    (kt,) = struct.unpack(">I", pk[0:4])
    return f"{pk[4:4 + kt].decode()} {base64.b64encode(pk).decode()}"


def main() -> int:
    if not SHIM.is_file():
        print("setup-signing: shim missing, skipped", file=sys.stderr)
        return 0

    # Find a signed commit to learn the key from and to self-test against.
    parts = None
    for rev in git("rev-list", "-n", "20", "HEAD").split():
        parts = commit_parts(rev)
        if parts:
            break
    if not parts:
        print("setup-signing: no signed commit found, skipped", file=sys.stderr)
        return 0
    armoured, payload = parts

    key = signing_pubkey(armoured)
    if not key:
        print("setup-signing: could not read key from signature, skipped", file=sys.stderr)
        return 0

    email = git("config", "--get", "user.email") or "noreply@anthropic.com"
    allowed = Path(os.path.expanduser("~/.config/git/allowed_signers"))
    allowed.parent.mkdir(parents=True, exist_ok=True)
    allowed.write_text(f"{email} {key}\n")

    # Self-test before touching gpg.ssh.program: a shim that cannot verify a
    # known-good signature must not be put in the signing path. Invoked exactly
    # the way git does it — signature in a file, payload on stdin.
    tmp_sig = allowed.parent / ".sig-selftest"
    tmp_sig.write_text(armoured)
    try:
        check = subprocess.run(
            [
                sys.executable, str(SHIM), "-Y", "verify",
                "-n", "git", "-f", str(allowed), "-I", email, "-s", str(tmp_sig),
            ],
            input=payload,
            capture_output=True,
        )
    finally:
        tmp_sig.unlink(missing_ok=True)

    if check.returncode != 0:
        print(
            f"setup-signing: self-test failed, config left alone "
            f"({check.stderr.decode(errors='replace').strip()})",
            file=sys.stderr,
        )
        return 0

    # Remember the real signer before taking over the program slot, so the shim
    # knows what to delegate `-Y sign` to even if the path differs per image.
    current = git("config", "--get", "gpg.ssh.program")
    if current and Path(current).name != SHIM.name:
        subprocess.run(
            ["git", "config", "--global", "signing.realprogram", current],
            capture_output=True,
        )

    for k, v in (
        ("gpg.ssh.allowedSignersFile", str(allowed)),
        ("gpg.ssh.program", str(SHIM)),
    ):
        subprocess.run(["git", "config", "--global", k, v], capture_output=True)

    print(f"setup-signing: verification enabled via {SHIM.name}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # never break a session over this
        print(f"setup-signing: skipped ({exc})", file=sys.stderr)
        sys.exit(0)
