import { BaseDocumentLoader } from "@langchain/core/document_loaders/base";
import { Document } from "@langchain/core/documents";
import path from "node:path";

export class RelativeTextLoader extends BaseDocumentLoader {
  private path: string;
  private base?: string;

  constructor(path: string, base?: string) {
    super();
    this.path = path;
    this.base = base;
  }

  async load() {
    const text = await Deno.readTextFile(this.path);
    const relativePath = this.base && path.relative(this.base, this.path);
    const metadata = {
      source: relativePath ?? this.path,
    };
    const parsed = [text];
    parsed.forEach((pageContent, i) => {
      if (typeof pageContent !== "string") {
        throw new Error(
          `Expected string, at position ${i} got ${typeof pageContent}`,
        );
      }
    });

    return parsed.map((pageContent) =>
      new Document({
        id: relativePath,
        pageContent,
        metadata,
      })
    );
  }
}
