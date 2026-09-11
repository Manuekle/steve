// The one tool this specialist keeps: the business's own documents.
//
// Re-exported rather than rewritten. A subagent's tools/ directory is its own
// namespace, but the tool itself is the same tool — a second copy of the
// retrieval logic would drift from the root's the first time either changed.
export { default } from "../../../tools/search_knowledge";
