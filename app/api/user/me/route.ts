import { NextResponse } from "next/server";
import { requireDbUser, AuthenticationError } from "@/lib/auth";

/**
 * GET /api/user/me
 *
 * Returns the current authenticated user's database record.
 * Automatically syncs the Clerk user to the database on first request.
 *
 * Response:
 * - 200: { user: DbUser }
 * - 401: { error: string, code: string } - Not authenticated
 * - 500: { error: string } - Server error
 */
export async function GET() {
  try {
    const user = await requireDbUser();

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
      },
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 401 }
      );
    }

    // Log unexpected errors (in production, use proper logging)
    console.error("Unexpected error in GET /api/user/me:", error);

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
