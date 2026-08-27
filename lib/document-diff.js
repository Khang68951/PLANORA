const blockEnd = /<\/(p|div|h[1-6]|li|blockquote|pre|tr)>/gi;
const entityMap = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

export function documentHtmlToText(html = "") {
  return String(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(blockEnd, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(
      /&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,
      (match, entity) => {
        if (entity[0] === "#") {
          const hexadecimal = entity[1]?.toLowerCase() === "x";
        const value = Number.parseInt(
          entity.slice(hexadecimal ? 2 : 1),
          hexadecimal ? 16 : 10,
        );
        const validCodePoint =
          Number.isInteger(value) &&
          value >= 0 &&
          value <= 0x10ffff &&
          !(value >= 0xd800 && value <= 0xdfff);
        return validCodePoint ? String.fromCodePoint(value) : match;
        }
        return entityMap[entity.toLowerCase()] ?? match;
      },
    )
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const tokenize = (text) => text.match(/\s+|[^\s]+/g) || [];

function pushChunk(chunks, type, text) {
  if (!text) return;
  const previous = chunks.at(-1);
  if (previous?.type === type) previous.text += text;
  else chunks.push({ type, text });
}

export function buildDocumentDiff(
  currentHtml,
  proposedHtml,
  { matrixLimit = 250_000 } = {},
) {
  const currentText = documentHtmlToText(currentHtml);
  const proposedText = documentHtmlToText(proposedHtml);
  const before = tokenize(currentText);
  const after = tokenize(proposedText);
  let prefix = 0;
  while (
    prefix < before.length &&
    prefix < after.length &&
    before[prefix] === after[prefix]
  )
    prefix += 1;
  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  )
    suffix += 1;

  const oldMiddle = before.slice(prefix, before.length - suffix);
  const newMiddle = after.slice(prefix, after.length - suffix);
  const chunks = [];
  pushChunk(chunks, "same", before.slice(0, prefix).join(""));

  if (!oldMiddle.length) pushChunk(chunks, "added", newMiddle.join(""));
  else if (!newMiddle.length) pushChunk(chunks, "removed", oldMiddle.join(""));
  else if (oldMiddle.length * newMiddle.length > matrixLimit) {
    pushChunk(chunks, "removed", oldMiddle.join(""));
    pushChunk(chunks, "added", newMiddle.join(""));
  } else {
    const rows = Array.from(
      { length: oldMiddle.length + 1 },
      () => new Uint32Array(newMiddle.length + 1),
    );
    for (let oldIndex = oldMiddle.length - 1; oldIndex >= 0; oldIndex -= 1) {
      for (let newIndex = newMiddle.length - 1; newIndex >= 0; newIndex -= 1) {
        rows[oldIndex][newIndex] =
          oldMiddle[oldIndex] === newMiddle[newIndex]
            ? rows[oldIndex + 1][newIndex + 1] + 1
            : Math.max(
                rows[oldIndex + 1][newIndex],
                rows[oldIndex][newIndex + 1],
              );
      }
    }
    let oldIndex = 0;
    let newIndex = 0;
    while (oldIndex < oldMiddle.length && newIndex < newMiddle.length) {
      if (oldMiddle[oldIndex] === newMiddle[newIndex]) {
        pushChunk(chunks, "same", oldMiddle[oldIndex]);
        oldIndex += 1;
        newIndex += 1;
      } else if (rows[oldIndex + 1][newIndex] >= rows[oldIndex][newIndex + 1]) {
        pushChunk(chunks, "removed", oldMiddle[oldIndex]);
        oldIndex += 1;
      } else {
        pushChunk(chunks, "added", newMiddle[newIndex]);
        newIndex += 1;
      }
    }
    pushChunk(chunks, "removed", oldMiddle.slice(oldIndex).join(""));
    pushChunk(chunks, "added", newMiddle.slice(newIndex).join(""));
  }

  if (suffix)
    pushChunk(chunks, "same", before.slice(before.length - suffix).join(""));
  return {
    currentText,
    proposedText,
    chunks,
    addedParts: chunks.filter((chunk) => chunk.type === "added").length,
    removedParts: chunks.filter((chunk) => chunk.type === "removed").length,
  };
}
