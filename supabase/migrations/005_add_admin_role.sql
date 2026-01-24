-- Migration: Add Admin Role to Organization System
-- Description: Adds 'admin' role to org_role enum for organization member management
-- Dependencies: 002_permission_model.sql

-- Add 'admin' to the org_role enum
ALTER TYPE org_role ADD VALUE IF NOT EXISTS 'admin';
