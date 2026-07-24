import { strFromU8, unzipSync } from "fflate";
import { ParsedWorkbook } from "./parser";

const ODS_MIMETYPE = "application/vnd.oasis.opendocument.spreadsheet";

/**
 * Returns the `content.xml` text if `data` is an ODS archive, otherwise null.
 * Throws if the archive identifies as ODS but is missing `content.xml`.
 */
export function readOdsContent(data: ArrayBuffer): string | null {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(data));
  } catch {
    return null;
  }

  const mimetype = files["mimetype"] ? strFromU8(files["mimetype"]).trim() : "";
  // A different, known mimetype (another ODF app such as .odt/.odp, or any
  // non-spreadsheet package) is not ours — let it fall through to the xlsx path.
  if (mimetype && mimetype !== ODS_MIMETYPE) return null;

  const contentBytes = files["content.xml"];
  const content = contentBytes ? strFromU8(contentBytes) : "";

  // Accept when the mimetype names a spreadsheet, or (for producers that omit
  // the optional mimetype entry) when the content is actually a spreadsheet.
  const looksLikeOds =
    mimetype === ODS_MIMETYPE || content.includes("<office:spreadsheet");

  if (!looksLikeOds) return null;
  if (!contentBytes) {
    throw new Error("File is not a valid .ods spreadsheet.");
  }
  return content;
}

export function parseOds(_contentXml: string): ParsedWorkbook {
  throw new Error("ODS parsing not implemented yet.");
}
