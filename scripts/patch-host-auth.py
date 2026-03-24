#!/usr/bin/env python3
"""
Patch FunctionAuthorizationHandler to bypass auth for local development.

This matches Core Tools behavior where HTTP functions with authLevel 'function'
or 'admin' can be called without keys during local development.

Usage: python patch-host-auth.py <host-source-dir>
"""

import re
import sys
from pathlib import Path


def patch_auth_handler(host_dir: Path) -> bool:
    """Patch FunctionAuthorizationHandler.cs to bypass auth."""
    auth_file = host_dir / "src/WebJobs.Script.WebHost/Security/Authorization/FunctionAuthorizationHandler.cs"
    
    if not auth_file.exists():
        print(f"[FAIL] {auth_file} not found")
        return False
    
    content = auth_file.read_text()
    
    # Pattern matches the HandleRequirementAsync method
    pattern = (
        r'protected override Task HandleRequirementAsync\('
        r'AuthorizationHandlerContext context, '
        r'FunctionAuthorizationRequirement requirement, '
        r'FunctionDescriptor resource\)\s*\{.*?return Task\.CompletedTask;\s*\}'
    )
    
    replacement = '''protected override Task HandleRequirementAsync(AuthorizationHandlerContext context, FunctionAuthorizationRequirement requirement, FunctionDescriptor resource)
        {
            // fnx patch: bypass auth for local development (matches Core Tools behavior)
            context.Succeed(requirement);
            return Task.CompletedTask;
        }'''
    
    if not re.search(pattern, content, re.DOTALL):
        print("[FAIL] HandleRequirementAsync pattern not found")
        print("  The host source code may have changed.")
        return False
    
    patched = re.sub(pattern, replacement, content, flags=re.DOTALL)
    auth_file.write_text(patched)
    
    # Verify patch was applied
    if "fnx patch" in auth_file.read_text():
        print("[OK] Patched FunctionAuthorizationHandler.cs to BYPASS auth")
        print("  (All HTTP functions now accessible without keys locally)")
        return True
    else:
        print("[FAIL] Patch verification failed")
        return False


def main():
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <host-source-dir>")
        sys.exit(1)
    
    host_dir = Path(sys.argv[1])
    if not host_dir.is_dir():
        print(f"[FAIL] {host_dir} is not a directory")
        sys.exit(1)
    
    if not patch_auth_handler(host_dir):
        sys.exit(1)


if __name__ == "__main__":
    main()
