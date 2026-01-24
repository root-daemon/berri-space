import { NextResponse } from "next/server";
import {
  getCurrentUser,
  getCurrentOrganization,
  AuthenticationError,
} from "@/lib/auth";

/**
 * GET /api/context
 *
 * Returns the current user and organization context.
 * This is an example endpoint demonstrating the auth helpers.
 *
 * Response:
 * - 200: { user, organization, role, isSuperAdmin }
 * - 401: { error, code } if not authenticated
 * - 500: { error } for unexpected errors
 */
export async function GET() {
  try {
    // Get the authenticated user
    const user = await getCurrentUser();

    // Get the user's organization context
    const { organization, role, isSuperAdmin } = await getCurrentOrganization();

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      organization: {
        id: organization.id,
        name: organization.name,
      },
      role,
      isSuperAdmin,
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 401 }
      );
    }

    console.error("Context fetch error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
