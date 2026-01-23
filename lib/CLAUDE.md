# CLAUDE.md — lib/

This directory contains shared core logic used across the backend.

---

## Responsibilities

- Authorization helpers
- Permission evaluation
- Shared utilities used by APIs and services

---

## Authorization Rules

- All permission checks must go through a single helper function
  (e.g. `canUserAccess`)
- No API or service may bypass this logic
- Do not duplicate permission logic elsewhere
- Permission checks must be explicit and readable

---

## Design Rules

- Functions here must be side-effect free where possible
- No direct HTTP or request/response handling
- No UI assumptions
- Database access must be intentional and minimal

---

## Safety Rules

- Default to deny access if unsure
- Do not infer permissions
- Do not accept client-provided roles or flags as truth