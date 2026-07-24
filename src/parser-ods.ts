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
  const looksLikeOds =
    mimetype === ODS_MIMETYPE ||
    (Boolean(files["content.xml"]) && !files["[Content_Types].xml"]);

  if (!looksLikeOds) return null;
  if (!files["content.xml"]) {
    throw new Error("File is not a valid .ods spreadsheet.");
  }
  return strFromU8(files["content.xml"]);
}

export function parseOds(_contentXml: string): ParsedWorkbook {
  throw new Error("ODS parsing not implemented yet.");
}
