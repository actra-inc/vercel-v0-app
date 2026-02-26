"use server"

async function validateTogglCredentials(token: string, workspaceId: string) {
  try {
    const auth = Buffer.from(`${token}:api_token`).toString("base64")

    // First, test with a simpler endpoint that's less likely to have permission issues
    const meRes = await fetch("https://api.track.toggl.com/api/v9/me", {
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    })

    if (!meRes.ok) {
      console.error("Toggl API Token validation failed:", await meRes.text())
      throw new Error("Invalid Toggl API Token.")
    }

    // Only check workspace if the token is valid
    const workspaceRes = await fetch(`https://api.track.toggl.com/api/v9/workspaces/${workspaceId}`, {
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    })

    if (!workspaceRes.ok) {
      console.error("Toggl Workspace validation failed:", await workspaceRes.text())
      throw new Error("Invalid Toggl Workspace ID.")
    }

    return { success: true }
  } catch (error) {
    console.error("Toggl validation error:", error)
    if (error instanceof Error) {
      throw error
    }
    throw new Error("Failed to validate Toggl credentials.")
  }
}

export async function saveTogglCredentials(prevState: any, formData: FormData) {
  // This function is deprecated
  // Credentials are now saved directly in localStorage via the component
  return {
    message: "This function is deprecated. Please use the new save mechanism.",
    success: false,
  }
}
