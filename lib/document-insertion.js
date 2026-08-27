export const DOCUMENT_INSERT_POSITIONS = ["start", "end", "before", "after"];

export function insertDocumentHtml(currentHtml, { contentHtml, position, anchorText }) {
  if (typeof currentHtml !== "string" || typeof contentHtml !== "string") {
    throw new Error("Document content is invalid.");
  }
  if (!DOCUMENT_INSERT_POSITIONS.includes(position)) {
    throw new Error("Choose start, end, before, or after for the insertion.");
  }
  if (position === "start") return `${contentHtml}${currentHtml}`;
  if (position === "end") return `${currentHtml}${contentHtml}`;
  if (typeof anchorText !== "string" || !anchorText || anchorText.length > 500) {
    throw new Error("Before and after insertions require an exact text anchor.");
  }
  const index = currentHtml.indexOf(anchorText);
  if (index < 0) throw new Error("The insertion anchor was not found in the document.");
  const insertionIndex = position === "before" ? index : index + anchorText.length;
  return `${currentHtml.slice(0, insertionIndex)}${contentHtml}${currentHtml.slice(insertionIndex)}`;
}

export function removeDocumentHtml(currentHtml, { targetText, occurrence = 1 }) {
  if (typeof currentHtml !== "string" || typeof targetText !== "string" || !targetText) {
    throw new Error("Document removal content is invalid.");
  }
  if (!Number.isInteger(occurrence) || occurrence < 1 || occurrence > 50) {
    throw new Error("Document removal occurrence must be between 1 and 50.");
  }
  let index = -1;
  let from = 0;
  for (let match = 0; match < occurrence; match += 1) {
    index = currentHtml.indexOf(targetText, from);
    if (index < 0) throw new Error("The exact text occurrence was not found in the document.");
    from = index + targetText.length;
  }
  return `${currentHtml.slice(0, index)}${currentHtml.slice(index + targetText.length)}`;
}

export function materializeDocumentCommands(commands, documents) {
  const documentMap = new Map(documents.map((document) => [document.id, document]));
  const prepared = [];
  const preparedByDocument = new Map();
  const rejections = [];
  for (const command of commands) {
    if (!["documents.update", "documents.insert", "documents.remove"].includes(command.name)) {
      prepared.push(command);
      continue;
    }
    const document = documentMap.get(command.arguments.documentId);
    if (!document) {
      rejections.push({ name: command.name, error: "The selected document is no longer available." });
      continue;
    }
    const existingIndex = preparedByDocument.get(document.id);
    const previous = existingIndex === undefined ? null : prepared[existingIndex];
    const currentHtml = previous?.arguments.previewContentHtml ?? document.contentHtml;
    try {
      const previewContentHtml = command.name === "documents.update"
        ? command.arguments.contentHtml
        : command.name === "documents.insert"
          ? insertDocumentHtml(currentHtml, command.arguments)
          : removeDocumentHtml(currentHtml, command.arguments);
      if (typeof previewContentHtml !== "string" || previewContentHtml.length > 500_000) {
        throw new Error("The proposed document would exceed the supported size.");
      }
      if (existingIndex === undefined) {
        preparedByDocument.set(document.id, prepared.length);
        prepared.push({
          ...command,
          arguments: {
            ...command.arguments,
            previewContentHtml,
            expectedUpdatedAt: document.updatedAt,
          },
        });
      } else {
        const mergedArguments = {
          ...previous.arguments,
          ...(command.arguments.title ? { title: command.arguments.title } : {}),
          previewContentHtml,
        };
        if (previous.name === "documents.update") mergedArguments.contentHtml = previewContentHtml;
        prepared[existingIndex] = {
          ...previous,
          summary: `${previous.summary}; ${command.summary}`.slice(0, 240),
          arguments: mergedArguments,
        };
      }
    } catch (error) {
      rejections.push({ name: command.name, error: error.message });
    }
  }
  return { commands: prepared, rejections };
}
