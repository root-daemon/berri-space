# Permission Enforcement Test Suite

This directory contains tests for the centralized permission enforcement system.

## Overview

The test suite verifies that:
1. `canUserAccess` correctly enforces permissions for all actions
2. All API routes use `canUserAccess` (no inline checks)
3. Default deny on ambiguity
4. Permission inheritance works correctly
5. Deny permissions always win
6. Role hierarchy is enforced

## Test Structure

The test suite is organized into the following sections:

### 1. canUserAccess Tests
- **Folder Permissions**: Tests for view, create_subfolder, delete, restore actions
- **File Permissions**: Tests for view, download, rename, delete actions
- **Permission Inheritance**: Tests inheritance from parent folders
- **Deny Permissions**: Tests that deny permissions always win
- **Team Ownership**: Tests team-based access control
- **Orphaned Resources**: Tests super_admin access to orphaned resources
- **Unknown Actions**: Tests default deny for unknown actions
- **Default Deny on Ambiguity**: Tests error handling and default deny

### 2. assertAccess Tests
- Tests that `assertAccess` throws `PermissionError` when access is denied
- Tests that `assertAccess` returns the role when access is allowed

### 3. canUserRestore Tests
- Tests restore permission for deleted resources
- Tests super_admin access to orphaned deleted resources

### 4. API Route Permission Enforcement
- Manual audit checklist for all API routes
- Verifies no inline permission checks exist

### 5. Role Hierarchy Tests
- Tests that admin > editor > viewer hierarchy is enforced
- Tests that higher roles can perform lower role actions

### 6. Edge Cases
- Concurrent permission changes
- Circular folder structures
- Deep folder hierarchies
- Multiple grants (highest wins)

## Running Tests

### Prerequisites

1. Install a testing framework (e.g., Vitest):
   ```bash
   npm install -D vitest @vitest/ui
   ```

2. Set up test database with schema

3. Configure test environment variables

### Setup

The test suite requires:
- A test database with the full schema
- Test data setup function (`setupTestData`)
- Test data cleanup function (`cleanupTestData`)

### Implementation Notes

The test file (`permissions.test.ts`) contains test structure and documentation. To make it runnable:

1. Implement `setupTestData()` to create test data
2. Implement `cleanupTestData()` to clean up after tests
3. Fill in the test cases with actual assertions
4. Configure your test runner

## Manual Verification Checklist

Even without automated tests, you can manually verify:

- [ ] All API routes import and use `canUserAccess` or `assertAccess`
- [ ] No inline permission checks using `organization_members.role` or `owner_team_id` comparisons
- [ ] All folder operations use permission checks
- [ ] All file operations use permission checks
- [ ] Restore operations use `canUserRestore` for deleted resources
- [ ] Unknown actions default to deny
- [ ] Database errors default to deny

## Test Coverage Goals

- 100% coverage of `canUserAccess` function
- 100% coverage of all action types (folder and file)
- 100% coverage of permission inheritance scenarios
- 100% coverage of deny permission scenarios
- 100% coverage of edge cases
