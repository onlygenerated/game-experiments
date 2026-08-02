#!/usr/bin/env python3
"""
An `ssh-keygen -Y` stand-in that can both sign and verify.

This container signs commits through a helper (`/tmp/code-sign`) that only
implements `-Y sign`, and it has no `ssh-keygen` at all. So commits are signed
correctly but git can never check one, and `git log --show-signature` fails in
a way that reads as "these commits are unsigned" — which is wrong, and which
has already cost an unattended run a cycle of reasoning about rewriting
history.

This shim closes the gap:

  -Y sign             delegated verbatim to the real helper (exec, no parsing)
  -Y find-principals  answered from the allowed-signers file
  -Y verify           verified natively against the SSHSIG blob

Signing is delegated rather than reimplemented precisely because breaking it
would break every commit. If the helper cannot be found, `sign` fails loudly
rather than silently producing an unsigned commit.
"""

import base64
import hashlib
import os
import struct
import subprocess
import sys
from pathlib import Path

MAGIC = b"SSHSIG"
# Candidate paths for the real signer, in preference order. The env var wins so
# a caller can pin it; /tmp/code-sign is what this environment ships today.
HELPERS = ("/tmp/code-sign", "/opt/env-runner/environment-manager")


# --- ssh wire format ------------------------------------------------------


def read_string(buf: bytes, off: int) -> tuple[bytes, int]:
    (n,) = struct.unpack(">I", buf[off : off + 4])
    off += 4
    return buf[off : off + n], off + n


def write_string(b: bytes) -> bytes:
    return struct.pack(">I", len(b)) + b


def parse_sshsig(armoured: str) -> dict:
    """Parse a PEM-armoured SSHSIG blob into its fields."""
    body = "".join(
        line.strip()
        for line in armoured.splitlines()
        if line.strip() and "SSH SIGNATURE" not in line
    )
    blob = base64.b64decode(body)
    if blob[:6] != MAGIC:
        raise ValueError("not an SSHSIG blob")

    off = 6
    (version,) = struct.unpack(">I", blob[off : off + 4])
    off += 4
    pubkey, off = read_string(blob, off)
    namespace, off = read_string(blob, off)
    reserved, off = read_string(blob, off)
    hash_algo, off = read_string(blob, off)
    signature, off = read_string(blob, off)
    return {
        "version": version,
        "pubkey": pubkey,
        "namespace": namespace,
        "reserved": reserved,
        "hash_algo": hash_algo.decode(),
        "signature": signature,
    }


def pubkey_authorized_line(pubkey: bytes) -> str:
    """Render a raw public-key blob as an `ssh-ed25519 AAAA...` line."""
    algo, _ = read_string(pubkey, 0)
    return f"{algo.decode()} {base64.b64encode(pubkey).decode()}"


def fingerprint(pubkey: bytes) -> str:
    digest = hashlib.sha256(pubkey).digest()
    return "SHA256:" + base64.b64encode(digest).decode().rstrip("=")


# --- allowed signers ------------------------------------------------------


def load_allowed(path: str) -> list[tuple[str, str]]:
    """Return (principals, key-line) pairs from an allowed_signers file."""
    out: list[tuple[str, str]] = []
    for raw in Path(path).read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        principals = parts[0]
        # Options may sit between the principals and the key; find the key by
        # looking for the algorithm token rather than assuming a fixed offset.
        for i, tok in enumerate(parts[1:], start=1):
            if tok.startswith(("ssh-", "ecdsa-", "sk-")) and i + 1 < len(parts):
                out.append((principals, f"{tok} {parts[i + 1]}"))
                break
    return out


# --- verification ---------------------------------------------------------


def verify_signature(sig: dict, message: bytes) -> bool:
    algo, off = read_string(sig["pubkey"], 0)
    if algo != b"ssh-ed25519":
        raise ValueError(f"unsupported key type {algo.decode()}")
    raw_key, _ = read_string(sig["pubkey"], off)

    sig_algo, off = read_string(sig["signature"], 0)
    sig_bytes, _ = read_string(sig["signature"], off)
    if sig_algo != b"ssh-ed25519":
        raise ValueError(f"unsupported signature type {sig_algo.decode()}")

    hasher = {"sha512": hashlib.sha512, "sha256": hashlib.sha256}[sig["hash_algo"]]
    signed_data = (
        MAGIC
        + write_string(sig["namespace"])
        + write_string(sig["reserved"])
        + write_string(sig["hash_algo"].encode())
        + write_string(hasher(message).digest())
    )
    return ed25519_verify(raw_key, signed_data, sig_bytes)


# --- ed25519 (RFC 8032 reference arithmetic) ------------------------------
#
# Deliberately dependency-free. `cryptography` is present in this image but its
# native backend is not loadable, and a verifier that only works when an
# optional wheel happens to be intact is exactly the flakiness this shim is
# supposed to remove. One signature per commit, so the speed is irrelevant.

P = 2**255 - 19
Q = 2**252 + 27742317777372353535851937790883648493
D = -121665 * pow(121666, P - 2, P) % P
SQRT_M1 = pow(2, (P - 1) // 4, P)


def _point_add(a: tuple, b: tuple) -> tuple:
    """Extended twisted-Edwards addition; points are (X, Y, Z, T)."""
    aa = (a[1] - a[0]) * (b[1] - b[0]) % P
    bb = (a[1] + a[0]) * (b[1] + b[0]) % P
    cc = 2 * a[3] * b[3] * D % P
    dd = 2 * a[2] * b[2] % P
    e, f, g, h = bb - aa, dd - cc, dd + cc, bb + aa
    return (e * f % P, g * h % P, f * g % P, e * h % P)


def _point_mul(s: int, pt: tuple) -> tuple:
    out = (0, 1, 1, 0)
    while s > 0:
        if s & 1:
            out = _point_add(out, pt)
        pt = _point_add(pt, pt)
        s >>= 1
    return out


def _point_equal(a: tuple, b: tuple) -> bool:
    return (a[0] * b[2] - b[0] * a[2]) % P == 0 and (a[1] * b[2] - b[1] * a[2]) % P == 0


def _recover_x(y: int, sign: int) -> int | None:
    if y >= P:
        return None
    x2 = (y * y - 1) * pow(D * y * y + 1, P - 2, P) % P
    if x2 == 0:
        return None if sign else 0
    x = pow(x2, (P + 3) // 8, P)
    if (x * x - x2) % P != 0:
        x = x * SQRT_M1 % P
    if (x * x - x2) % P != 0:
        return None
    if (x & 1) != sign:
        x = P - x
    return x


def _decompress(s: bytes) -> tuple | None:
    if len(s) != 32:
        return None
    y = int.from_bytes(s, "little")
    sign, y = y >> 255, y & ((1 << 255) - 1)
    x = _recover_x(y, sign)
    return None if x is None else (x, y, 1, x * y % P)


_GY = 4 * pow(5, P - 2, P) % P
_G = (_recover_x(_GY, 0), _GY, 1, _recover_x(_GY, 0) * _GY % P)


def ed25519_verify(pubkey: bytes, message: bytes, signature: bytes) -> bool:
    if len(pubkey) != 32 or len(signature) != 64:
        return False
    a = _decompress(pubkey)
    r = _decompress(signature[:32])
    if a is None or r is None:
        return False
    s = int.from_bytes(signature[32:], "little")
    if s >= Q:
        return False
    h = int.from_bytes(hashlib.sha512(signature[:32] + pubkey + message).digest(), "little") % Q
    return _point_equal(_point_mul(s, _G), _point_add(r, _point_mul(h, a)))


# --- subcommands ----------------------------------------------------------


def opt(argv: list[str], flag: str) -> str | None:
    return argv[argv.index(flag) + 1] if flag in argv else None


def real_helper() -> str | None:
    """Whatever was in `gpg.ssh.program` before this shim took the slot."""
    out = subprocess.run(
        ["git", "config", "--get", "signing.realprogram"], capture_output=True, text=True
    ).stdout.strip()
    return out or None


def do_sign(argv: list[str]) -> int:
    candidates = [os.environ.get("GIT_SSH_SIGN_HELPER"), real_helper(), *HELPERS]
    for path in candidates:
        if path and Path(path).name == Path(__file__).name:
            continue  # never delegate to ourselves
        if path and os.path.exists(path):
            os.execv(path, [path, *argv])  # replaces this process
    print("ssh-sign-shim: no signing helper found", file=sys.stderr)
    return 1


def do_find_principals(argv: list[str]) -> int:
    allowed = opt(argv, "-f")
    sigfile = opt(argv, "-s")
    if not allowed or not sigfile:
        return 1
    sig = parse_sshsig(Path(sigfile).read_text())
    want = pubkey_authorized_line(sig["pubkey"])
    found = [p for p, key in load_allowed(allowed) if key == want]
    if not found:
        return 1
    print("\n".join(found))
    return 0


def do_verify(argv: list[str]) -> int:
    allowed = opt(argv, "-f")
    sigfile = opt(argv, "-s")
    principal = opt(argv, "-I")
    namespace = opt(argv, "-n") or "git"
    if not allowed or not sigfile:
        return 1

    sig = parse_sshsig(Path(sigfile).read_text())
    if sig["namespace"].decode() != namespace:
        print("ssh-sign-shim: namespace mismatch", file=sys.stderr)
        return 1

    want = pubkey_authorized_line(sig["pubkey"])
    matches = [p for p, key in load_allowed(allowed) if key == want]
    if not matches:
        print(
            f'ssh-sign-shim: no key for principal "{principal}" in {allowed}',
            file=sys.stderr,
        )
        return 1
    if principal and not any(principal in p.split(",") for p in matches):
        print(f'ssh-sign-shim: key does not match principal "{principal}"', file=sys.stderr)
        return 1

    if not verify_signature(sig, sys.stdin.buffer.read()):
        print("ssh-sign-shim: signature verification failed", file=sys.stderr)
        return 1

    # Mirror ssh-keygen's wording; git surfaces this line to the user.
    who = principal or matches[0]
    print(
        f'Good "{namespace}" signature for {who} with ED25519 key '
        f'{fingerprint(sig["pubkey"])}',
        file=sys.stderr,
    )
    return 0


def main(argv: list[str]) -> int:
    if "-Y" not in argv:
        return do_sign(argv)  # unknown invocation; let the real helper answer
    mode = argv[argv.index("-Y") + 1]
    if mode == "sign":
        return do_sign(argv)
    if mode == "find-principals":
        return do_find_principals(argv)
    if mode in ("verify", "check-novalidate"):
        return do_verify(argv)
    return do_sign(argv)


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except Exception as exc:
        print(f"ssh-sign-shim: {exc}", file=sys.stderr)
        sys.exit(1)
