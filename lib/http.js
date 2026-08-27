import { NextResponse } from "next/server";
import { RequestValidationError } from "./request-json.js";
export { readJson, readOptionalJson, RequestValidationError } from "./request-json.js";

export function errorResponse(error, fallback = "The request could not be completed.") {
  if (error instanceof RequestValidationError) {
    return NextResponse.json({ error: error.message, errors: error.errors, code: "VALIDATION_ERROR" }, { status: 400 });
  }
  console.error(error);
  return NextResponse.json({ error: fallback, code: "INTERNAL_ERROR" }, { status: 500 });
}
