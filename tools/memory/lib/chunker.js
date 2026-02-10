/**
 * Markdown chunker for memory files.
 * Splits .jat/memory/*.md files into ~500 token chunks,
 * respecting heading boundaries with configurable overlap.
 */

// Rough token estimation: ~4 chars per token (conservative for English)
const CHARS_PER_TOKEN = 4;

/**
 * Estimate token count from text.
 * @param {string} text
 * @returns {number}
 */
export function estimateTokens(text) {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Parse YAML-like frontmatter from a memory file.
 * Handles the simple YAML format used by memory entries.
 * @param {string} content - Full file content
 * @returns {{ frontmatter: object, body: string, frontmatterEndLine: number }}
 */
export function parseFrontmatter(content) {
  const lines = content.split('\n');
  const frontmatter = {};
  let bodyStartLine = 0;

  if (lines[0]?.trim() === '---') {
    let endIdx = -1;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === '---') {
        endIdx = i;
        break;
      }
    }

    if (endIdx > 0) {
      bodyStartLine = endIdx + 1;
      for (let i = 1; i < endIdx; i++) {
        const line = lines[i];
        const colonIdx = line.indexOf(':');
        if (colonIdx === -1) continue;

        const key = line.slice(0, colonIdx).trim();
        let value = line.slice(colonIdx + 1).trim();

        // Parse arrays: [item1, item2]
        if (value.startsWith('[') && value.endsWith(']')) {
          value = value.slice(1, -1).split(',').map(s => s.trim());
        }

        frontmatter[key] = value;
      }
    }
  }

  const body = lines.slice(bodyStartLine).join('\n');
  return { frontmatter, body, frontmatterEndLine: bodyStartLine };
}

/**
 * Split markdown body into sections based on ## headings.
 * @param {string} body - Markdown body (after frontmatter)
 * @param {number} lineOffset - Line offset from frontmatter
 * @returns {Array<{ section: string, content: string, startLine: number, endLine: number }>}
 */
export function splitSections(body, lineOffset = 0) {
  const lines = body.split('\n');
  const sections = [];
  let currentSection = null;
  let currentLines = [];
  let sectionStartLine = lineOffset + 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = line.match(/^##\s+(.+)/);

    if (headingMatch) {
      // Save previous section
      if (currentSection !== null || currentLines.length > 0) {
        const content = currentLines.join('\n').trim();
        if (content) {
          sections.push({
            section: currentSection ?? 'preamble',
            content,
            startLine: sectionStartLine,
            endLine: lineOffset + i,
          });
        }
      }
      currentSection = normalizeHeading(headingMatch[1]);
      currentLines = [];
      sectionStartLine = lineOffset + i + 1;
    } else {
      currentLines.push(line);
    }
  }

  // Final section
  if (currentSection !== null || currentLines.length > 0) {
    const content = currentLines.join('\n').trim();
    if (content) {
      sections.push({
        section: currentSection ?? 'preamble',
        content,
        startLine: sectionStartLine,
        endLine: lineOffset + lines.length,
      });
    }
  }

  return sections;
}

/**
 * Normalize heading text to snake_case identifier.
 * "Key Files" -> "key_files", "Cross-Agent Intel" -> "cross_agent_intel"
 * @param {string} heading
 * @returns {string}
 */
function normalizeHeading(heading) {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .trim();
}

/**
 * Chunk a section's content into pieces of ~targetTokens tokens.
 * Respects paragraph boundaries when possible.
 * @param {object} section - { section, content, startLine, endLine }
 * @param {number} targetTokens - Target tokens per chunk (default 500)
 * @param {number} overlapTokens - Overlap tokens between chunks (default 50)
 * @returns {Array<{ section: string, content: string, startLine: number, endLine: number, tokenCount: number }>}
 */
export function chunkSection(section, targetTokens = 500, overlapTokens = 50) {
  const tokens = estimateTokens(section.content);

  // Small enough to be one chunk
  if (tokens <= targetTokens * 1.2) {
    return [{
      section: section.section,
      content: section.content,
      startLine: section.startLine,
      endLine: section.endLine,
      tokenCount: tokens,
    }];
  }

  // Split by paragraphs (double newline)
  const paragraphs = section.content.split(/\n\n+/);
  const chunks = [];
  let currentParts = [];
  let currentTokens = 0;
  let chunkStartLine = section.startLine;
  let lineAccum = section.startLine;

  for (const para of paragraphs) {
    const paraTokens = estimateTokens(para);
    const paraLines = para.split('\n').length;

    if (currentTokens + paraTokens > targetTokens && currentParts.length > 0) {
      // Emit current chunk
      const content = currentParts.join('\n\n');
      chunks.push({
        section: section.section,
        content,
        startLine: chunkStartLine,
        endLine: lineAccum,
        tokenCount: estimateTokens(content),
      });

      // Overlap: keep last paragraph(s) that fit within overlap budget
      const overlapParts = [];
      let overlapTokenCount = 0;
      for (let i = currentParts.length - 1; i >= 0; i--) {
        const pt = estimateTokens(currentParts[i]);
        if (overlapTokenCount + pt > overlapTokens) break;
        overlapParts.unshift(currentParts[i]);
        overlapTokenCount += pt;
      }

      currentParts = overlapParts;
      currentTokens = overlapTokenCount;
      chunkStartLine = lineAccum - overlapParts.join('\n\n').split('\n').length + 1;
    }

    currentParts.push(para);
    currentTokens += paraTokens;
    lineAccum += paraLines + 1; // +1 for the blank line between paragraphs
  }

  // Emit final chunk
  if (currentParts.length > 0) {
    const content = currentParts.join('\n\n');
    chunks.push({
      section: section.section,
      content,
      startLine: chunkStartLine,
      endLine: section.endLine,
      tokenCount: estimateTokens(content),
    });
  }

  return chunks;
}

/**
 * Full pipeline: parse frontmatter, split sections, chunk each section.
 * @param {string} fileContent - Full file content
 * @param {string} filePath - Relative path (for metadata)
 * @param {object} options - { targetTokens, overlapTokens }
 * @returns {{ frontmatter: object, chunks: Array<object> }}
 */
export function chunkMemoryFile(fileContent, filePath, options = {}) {
  const { targetTokens = 500, overlapTokens = 50 } = options;
  const { frontmatter, body, frontmatterEndLine } = parseFrontmatter(fileContent);
  const sections = splitSections(body, frontmatterEndLine);

  const chunks = [];
  for (const section of sections) {
    const sectionChunks = chunkSection(section, targetTokens, overlapTokens);
    for (const chunk of sectionChunks) {
      chunks.push({
        path: filePath,
        taskId: frontmatter.task ?? '',
        section: chunk.section,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        content: chunk.content,
        tokenCount: chunk.tokenCount,
      });
    }
  }

  return { frontmatter, chunks };
}
