#!/usr/bin/env python3
"""Audit and harden the S.M.U.V.E. hybrid authentication flow.

This is a repository maintenance script, not a replacement for the Angular
AuthService.  It preserves the API-first/localhost-legacy-fallback design while
making the two fragile parts of the flow explicit:

* API fallback is limited to transport, 404, and 5xx failures.
* Browser storage is probed before authentication relies on it.

Usage:
    python scripts/harden_auth_flow.py          # audit only
    python scripts/harden_auth_flow.py --fix    # apply safe, anchored changes
    python scripts/harden_auth_flow.py --fix --no-backup

The fixer refuses to edit files when an expected source anchor is missing.  A
backup is written beside each changed TypeScript file by default.
"""

from __future__ import annotations

import argparse
import re
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path


@dataclass
class Finding:
    level: str
    message: str


ROOT = Path(__file__).resolve().parents[1]
LOGIN = ROOT / "src/app/components/login/login.component.ts"
AUTH = ROOT / "src/app/services/auth.service.ts"
SECURITY = ROOT / "src/app/app.security.ts"

STRICT_FALLBACK = """this.canUseLegacyFallback() &&
        err instanceof ApiAuthError &&
        this.isLegacyFallbackStatus(err.status)"""


class PatchError(RuntimeError):
    pass


def read(path: Path) -> str:
    if not path.is_file():
        raise PatchError(f"required file does not exist: {path.relative_to(ROOT)}")
    return path.read_text(encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise PatchError(f"expected one {label}, found {count}")
    return text.replace(old, new, 1)


def audit(login: str, auth: str, security: str) -> list[Finding]:
    findings: list[Finding] = []

    broad_fallback = (
        "(!(err instanceof ApiAuthError) || this.isLegacyFallbackStatus(err.status))"
    )
    if broad_fallback in login:
        findings.append(Finding("ERROR", "login/register fallback treats every unknown exception as an API outage"))
    elif login.count(STRICT_FALLBACK) < 2:
        findings.append(Finding("ERROR", "both login and registration need an explicit ApiAuthError fallback guard"))

    if "legacy_auth_fallback" not in security:
        findings.append(Finding("ERROR", "legacy fallback configuration is missing"))
    else:
        if "host === 'localhost'" not in security or "host === '127.0.0.1'" not in security:
            findings.append(Finding("ERROR", "legacy fallback is not visibly restricted to loopback hosts"))

    if "private canUseStorage(" not in auth:
        findings.append(Finding("ERROR", "AuthService has no browser-storage availability probe"))
    if "!this.canUseStorage(localStorage)" not in auth:
        findings.append(Finding("ERROR", "login/register do not reject unavailable localStorage"))
    if "!this.canUseStorage(sessionStorage)" not in auth:
        findings.append(Finding("WARN", "session persistence does not probe sessionStorage before writing"))

    if not findings:
        findings.append(Finding("OK", "auth flow passed the hybrid architecture hardening checks"))
    return findings


def patch_login(text: str) -> str:
    old = """this.canUseLegacyFallback() &&
        (!(err instanceof ApiAuthError) || this.isLegacyFallbackStatus(err.status))"""
    return text.replace(old, STRICT_FALLBACK)


def patch_auth(text: str) -> str:
    if "private canUseStorage(" not in text:
        anchor = """  constructor() {}\n\n"""
        helper = """  constructor() {}\n\n  /**\n   * Storage APIs can exist but still throw in private/restricted contexts.\n   * Probe the exact store before using it so login fails clearly instead of\n   * leaving a partially-authenticated client session.\n   */\n  private canUseStorage(storage: Storage | undefined): storage is Storage {\n    if (!storage) return false;\n    try {\n      const probeKey = '__smuve_storage_probe__';\n      storage.setItem(probeKey, '1');\n      storage.removeItem(probeKey);\n      return true;\n    } catch {\n      return false;\n    }\n  }\n\n"""
        text = replace_once(text, anchor, helper, "AuthService storage helper anchor")

    text = replace_once(
        text,
        """    if (typeof localStorage === 'undefined') {\n""",
        """    if (typeof localStorage === 'undefined' || !this.canUseStorage(localStorage)) {\n""",
        "login storage guard",
    ) if "!this.canUseStorage(localStorage)" not in text else text

    # Registration has the same storage requirement but a separate guard.
    register_guard = """    if (typeof localStorage === 'undefined') {\n"""
    if text.count(register_guard):
        text = replace_once(
            text,
            register_guard,
            """    if (typeof localStorage === 'undefined' || !this.canUseStorage(localStorage)) {\n""",
            "register storage guard",
        )

    text = text.replace(
        """    if (typeof sessionStorage === 'undefined') return;\n""",
        """    if (typeof sessionStorage === 'undefined' || !this.canUseStorage(sessionStorage)) return;\n""",
        1,
    )
    return text


def write_with_backup(path: Path, content: str, backup: bool) -> None:
    current = path.read_text(encoding="utf-8")
    if current == content:
        return
    if backup:
        shutil.copy2(path, path.with_suffix(path.suffix + ".bak"))
    path.write_text(content, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fix", action="store_true", help="apply safe anchored fixes")
    parser.add_argument("--no-backup", action="store_true", help="do not create .bak files when fixing")
    args = parser.parse_args()

    try:
        login = read(LOGIN)
        auth = read(AUTH)
        security = read(SECURITY)
        before = audit(login, auth, security)

        if args.fix:
            fixed_login = patch_login(login)
            fixed_auth = patch_auth(auth)
            write_with_backup(LOGIN, fixed_login, not args.no_backup)
            write_with_backup(AUTH, fixed_auth, not args.no_backup)
            login, auth = fixed_login, fixed_auth

        findings = audit(login, auth, security)
    except (OSError, PatchError) as exc:
        print(f"AUTH HARDENING FAILED: {exc}", file=sys.stderr)
        return 2

    if args.fix:
        print("Applied safe auth hardening patches." if before != findings else "No changes were necessary.")
    for finding in findings:
        print(f"[{finding.level}] {finding.message}")

    return 1 if any(item.level == "ERROR" for item in findings) else 0


if __name__ == "__main__":
    raise SystemExit(main())
