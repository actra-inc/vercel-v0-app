import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"

export async function GET() {
  try {
    // Test basic connection
    const { data: authData, error: authError } = await supabase.auth.getSession()

    if (authError) {
      return NextResponse.json({
        success: false,
        error: `Auth error: ${authError.message}`,
      })
    }

    // Test database connection by listing tables
    const { data: tables, error: tablesError } = await supabase
      .from("information_schema.tables")
      .select("table_name")
      .eq("table_schema", "public")

    if (tablesError) {
      return NextResponse.json({
        success: false,
        error: `Database error: ${tablesError.message}`,
      })
    }

    // Test specific tables
    const requiredTables = ["users", "projects", "time_entries", "work_logs", "user_settings"]
    const existingTables = tables?.map((t) => t.table_name) || []
    const missingTables = requiredTables.filter((table) => !existingTables.includes(table))

    return NextResponse.json({
      success: true,
      tables: existingTables,
      missingTables,
      hasAllRequiredTables: missingTables.length === 0,
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: `Connection error: ${error.message}`,
    })
  }
}
