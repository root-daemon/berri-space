import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, AuthenticationError } from "@/lib/auth";
import {
  canUserAccess,
  getEffectiveRole,
  type ResourceAction,
} from "@/lib/permissions";
import type { ResourceType } from "@/lib/supabase/types";

/**
 * POST /api/permissions/check
 *
 * Checks if the current user has permission to perform an action on a resource.
 * This is a utility endpoint for testing and debugging permissions.
 *
 * Request body:
 * {
 *   resourceType: "folder" | "file",
 *   resourceId: string (UUID),
 *   action: string (e.g., "view", "delete", "rename")
 * }
 *
 * Response:
 * {
 *   allowed: boolean,
 *   role: "admin" | "editor" | "viewer" | null,
 *   reason?: string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const user = await getCurrentUser();

    // Parse request body
    const body = await request.json();
    const { resourceType, resourceId, action } = body as {
      resourceType?: ResourceType;
      resourceId?: string;
      action?: ResourceAction;
    };

    // Validate input
    if (!resourceType || !["folder", "file"].includes(resourceType)) {
      return NextResponse.json(
        { error: "Invalid resourceType. Must be 'folder' or 'file'" },
        { status: 400 }
      );
    }

    if (!resourceId || typeof resourceId !== "string") {
      return NextResponse.json(
        { error: "Invalid resourceId. Must be a UUID string" },
        { status: 400 }
      );
    }

    if (!action || typeof action !== "string") {
      return NextResponse.json(
        { error: "Invalid action. Must be a string" },
        { status: 400 }
      );
    }

    // Check permission
    const result = await canUserAccess(
      user.id,
      resourceType,
      resourceId,
      action
    );

    return NextResponse.json({
      allowed: result.allowed,
      role: result.role,
      reason: result.reason,
      // Include context for debugging
      context: {
        userId: user.id,
        resourceType,
        resourceId,
        action,
      },
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 401 }
      );
    }

    console.error("Permission check error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/permissions/check?resourceType=folder&resourceId=xxx
 *
 * Gets the effective role for the current user on a resource.
 * Simpler than POST - just returns the role without checking a specific action.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    const { searchParams } = new URL(request.url);
    const resourceType = searchParams.get("resourceType") as ResourceType;
    const resourceId = searchParams.get("resourceId");

    if (!resourceType || !["folder", "file"].includes(resourceType)) {
      return NextResponse.json(
        { error: "Invalid resourceType query param" },
        { status: 400 }
      );
    }

    if (!resourceId) {
      return NextResponse.json(
        { error: "Missing resourceId query param" },
        { status: 400 }
      );
    }

    const role = await getEffectiveRole(user.id, resourceType, resourceId);

    return NextResponse.json({
      hasAccess: role !== null,
      role,
      context: {
        userId: user.id,
        resourceType,
        resourceId,
      },
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 401 }
      );
    }

    console.error("Permission check error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
