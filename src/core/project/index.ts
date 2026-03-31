/**
 * Core project module — re-exports all project-related logic.
 */

export { serializeSource, parseSource, serializeFolder, parseFolder } from './source-format'
export { serializeTimeline, parseTimeline } from './timeline-format'
export { buildTreeFromSources } from './tree-builder'
