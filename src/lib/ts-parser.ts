/**
 * TypeScript parser for extracting exported methods and their JSDoc comments
 *
 * This module uses the TypeScript Compiler API to parse source files,
 * follow export chains, and extract method signatures with documentation.
 */

import * as ts from "typescript";
import { join } from "@std/path";

/**
 * Extracted method information from TypeScript source
 */
export interface ExtractedMethod {
  methodName: string;
  signature: string;
  jsDoc: string;
  sourceFile: string; // Relative to package root
  lineNumber: number;
  kind: "function" | "method" | "class" | "interface" | "type" | "const";
  isExported: boolean;
  exportPath?: string; // How it's exported (e.g., "helpers", "models")
  className?: string; // For methods: the parent class name
}

/**
 * Parse a TypeScript file and extract all exported declarations
 */
export function parseTypeScriptFile(
  filePath: string,
  packageRoot: string,
  compilerOptions?: ts.CompilerOptions,
): ExtractedMethod[] {
  // Create a TypeScript program with a single file
  const program = ts.createProgram({
    rootNames: [filePath],
    options: compilerOptions || {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      allowJs: false,
      skipLibCheck: true,
    },
  });

  const sourceFile = program.getSourceFile(filePath);
  if (!sourceFile) {
    throw new Error(`Could not load source file: ${filePath}`);
  }

  const checker = program.getTypeChecker();
  const methods: ExtractedMethod[] = [];
  const relativeSourceFile = filePath.replace(packageRoot + "/", "");

  // Visit all nodes in the source file
  function visit(node: ts.Node) {
    // Handle exported function declarations
    if (ts.isFunctionDeclaration(node) && node.name) {
      const isExported = hasExportModifier(node);
      if (isExported) {
        methods.push(extractMethodInfo(node, node.name, "function", relativeSourceFile, checker));
      }
    }
    
    // Handle exported class declarations
    else if (ts.isClassDeclaration(node) && node.name) {
      const isExported = hasExportModifier(node);
      if (isExported) {
        methods.push(extractMethodInfo(node, node.name, "class", relativeSourceFile, checker));
        
        // Also extract public methods from the class
        node.members?.forEach((member: ts.ClassElement) => {
          if (ts.isMethodDeclaration(member) && member.name) {
            const isPublic = !hasModifier(member, ts.SyntaxKind.PrivateKeyword);
            if (isPublic && ts.isIdentifier(member.name)) {
              const methodInfo = extractMethodInfo(member, member.name, "method", relativeSourceFile, checker);
              methodInfo.methodName = `${node.name!.text}.${member.name.text}`;
              methodInfo.className = node.name!.text;
              methods.push(methodInfo);
            }
          }
        });
      }
    }
    
    // Handle exported interface declarations
    else if (ts.isInterfaceDeclaration(node) && node.name) {
      const isExported = hasExportModifier(node);
      if (isExported) {
        methods.push(extractMethodInfo(node, node.name, "interface", relativeSourceFile, checker));
      }
    }
    
    // Handle exported type aliases
    else if (ts.isTypeAliasDeclaration(node) && node.name) {
      const isExported = hasExportModifier(node);
      if (isExported) {
        methods.push(extractMethodInfo(node, node.name, "type", relativeSourceFile, checker));
      }
    }
    
    // Handle exported variable/const declarations
    else if (ts.isVariableStatement(node)) {
      const isExported = hasExportModifier(node);
      if (isExported) {
        node.declarationList.declarations.forEach((decl: ts.VariableDeclaration) => {
          if (ts.isIdentifier(decl.name)) {
            methods.push(extractMethodInfo(decl, decl.name, "const", relativeSourceFile, checker));
          }
        });
      }
    }
    
    // Handle named exports: export { foo, bar }
    else if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
      node.exportClause.elements.forEach((element: ts.ExportSpecifier) => {
        // Track re-exports but don't extract details (they'll be found in original file)
        const exportName = element.name.text;
        // This is a re-export, we'll handle it by following the export chain
      });
    }

    // Continue visiting child nodes
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return methods;
}

/**
 * Extract method information from a TypeScript node
 */
function extractMethodInfo(
  node: ts.Node,
  nameNode: ts.Identifier,
  kind: ExtractedMethod["kind"],
  sourceFile: string,
  checker: ts.TypeChecker,
): ExtractedMethod {
  const methodName = nameNode.text;
  const signature = getSignature(node, checker);
  const jsDoc = getJSDocComment(node);
  const sourceFileObj = node.getSourceFile();
  const lineNumber = sourceFileObj.getLineAndCharacterOfPosition(node.getStart()).line + 1;

  return {
    methodName,
    signature,
    jsDoc,
    sourceFile,
    lineNumber,
    kind,
    isExported: true,
  };
}

/**
 * Check if a node has an export modifier
 */
function hasExportModifier(node: ts.Node): boolean {
  if (!ts.canHaveModifiers(node)) return false;
  const modifiers = ts.getModifiers(node);
  if (!modifiers) return false;
  return modifiers.some((mod: ts.Modifier) => mod.kind === ts.SyntaxKind.ExportKeyword);
}

/**
 * Check if a node has a specific modifier
 */
function hasModifier(node: ts.Node, modifierKind: ts.SyntaxKind): boolean {
  if (!ts.canHaveModifiers(node)) return false;
  const modifiers = ts.getModifiers(node);
  if (!modifiers) return false;
  return modifiers.some((mod: ts.Modifier) => mod.kind === modifierKind);
}

/**
 * Get the function/method signature as a string
 */
function getSignature(node: ts.Node, checker: ts.TypeChecker): string {
  // For functions and methods
  if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) {
    const signature = checker.getSignatureFromDeclaration(node);
    if (signature) {
      return checker.signatureToString(signature);
    }
  }
  
  // Fallback: get the text of the declaration
  const sourceFile = node.getSourceFile();
  let text = node.getText(sourceFile);
  
  // Trim to first 500 characters for long signatures
  if (text.length > 500) {
    text = text.substring(0, 500) + "...";
  }
  
  return text;
}

/**
 * Extract JSDoc comment from a node
 */
function getJSDocComment(node: ts.Node): string {
  const jsDocs = (node as any).jsDoc as ts.JSDoc[] | undefined;
  if (!jsDocs || jsDocs.length === 0) return "";

  // Combine all JSDoc comments
  return jsDocs
    .map((doc) => doc.comment)
    .filter((comment) => comment)
    .map((comment) => {
      if (typeof comment === "string") return comment;
      // Handle JSDocText nodes
      if (Array.isArray(comment)) {
        return comment.map((c) => c.text || "").join("");
      }
      return "";
    })
    .join("\n")
    .trim();
}

/**
 * Get all TypeScript files in a directory recursively
 */
export async function getAllTypeScriptFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  
  for await (const entry of Deno.readDir(dir)) {
    const fullPath = join(dir, entry.name);
    
    if (entry.isDirectory) {
      // Skip common directories
      if (["node_modules", "dist", "build", "__tests__", ".git"].includes(entry.name)) {
        continue;
      }
      const subFiles = await getAllTypeScriptFiles(fullPath);
      files.push(...subFiles);
    } else if (entry.isFile) {
      // Include .ts and .tsx files, exclude .test.ts and .d.ts
      if (
        (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) &&
        !entry.name.endsWith(".test.ts") &&
        !entry.name.endsWith(".d.ts")
      ) {
        files.push(fullPath);
      }
    }
  }
  
  return files;
}

/**
 * Parse package.json to get package metadata and export map
 */
export async function parsePackageJson(packageRoot: string): Promise<{
  name: string;
  version: string;
  exports: Record<string, unknown>;
}> {
  const packageJsonPath = join(packageRoot, "package.json");
  const content = await Deno.readTextFile(packageJsonPath);
  const packageJson = JSON.parse(content);
  
  return {
    name: packageJson.name || "unknown",
    version: packageJson.version || "0.0.0",
    exports: packageJson.exports || {},
  };
}

/**
 * Map source files to their export paths based on package.json exports
 */
export function mapSourceToExportPath(
  sourceFile: string,
  exports: Record<string, unknown>,
  packageRoot: string,
): string | undefined {
  // Normalize the source file path
  const normalizedSource = sourceFile.replace(/\\/g, "/");
  
  // Track best match (prefer more specific paths over wildcards)
  let bestMatch: { exportPath: string; specificity: number } | undefined;
  
  for (const [exportPath, exportValue] of Object.entries(exports)) {
    if (typeof exportValue === "object" && exportValue !== null) {
      // Handle export map objects like { "import": "./dist/...", "types": "./dist/..." }
      const exportObj = exportValue as Record<string, string>;
      const importPath = exportObj.import || exportObj.types || exportObj.require;
      
      if (importPath) {
        // Convert dist path to src path
        // e.g., "./dist/helpers/index.js" -> "src/helpers/index.ts"
        let srcPath = importPath
          .replace("./dist/", "src/")
          .replace(/\.js$/, ".ts")
          .replace(/\.d\.ts$/, ".ts");
        
        // Handle wildcard exports like "./loaders/*"
        if (srcPath.includes("*")) {
          const pathPrefix = srcPath.replace("*", "");
          if (normalizedSource.includes(pathPrefix)) {
            // Calculate specificity (longer paths are more specific)
            const specificity = pathPrefix.length;
            if (!bestMatch || specificity > bestMatch.specificity) {
              // Remove wildcard and trailing slash from export path
              const cleanExportPath = exportPath.replace(/\/\*$/, "").replace(/^\.\//, "");
              bestMatch = { exportPath: cleanExportPath, specificity };
            }
          }
        } else {
          // Exact match
          if (normalizedSource.endsWith(srcPath) || normalizedSource.includes(srcPath.replace(/\/index\.ts$/, "/"))) {
            const specificity = srcPath.length;
            if (!bestMatch || specificity > bestMatch.specificity) {
              const cleanExportPath = exportPath === "." ? "" : exportPath.replace(/^\.\//, "");
              bestMatch = { exportPath: cleanExportPath, specificity };
            }
          }
        }
      }
    }
  }
  
  return bestMatch?.exportPath;
}
