import { SubtitleCue } from '../types';

/**
 * Converts timestamp strings (00:01:23,456 or 00:01:23.456 or 01:23.456) to seconds
 */
function parseTimestampToSeconds(timestamp: string): number {
  const normalized = timestamp.trim().replace(',', '.');
  const parts = normalized.split(':');

  if (parts.length === 3) {
    const hours = parseFloat(parts[0]);
    const minutes = parseFloat(parts[1]);
    const seconds = parseFloat(parts[2]);
    return hours * 3600 + minutes * 60 + seconds;
  } else if (parts.length === 2) {
    const minutes = parseFloat(parts[0]);
    const seconds = parseFloat(parts[1]);
    return minutes * 60 + seconds;
  }
  return 0;
}

/**
 * Parses SRT or VTT content into an array of SubtitleCue
 */
export function parseSubtitles(content: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = normalized.split(/\n\n+/);

  let cueIndex = 1;

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length === 0) continue;

    // Skip WEBVTT header line if present
    if (lines[0].startsWith('WEBVTT') || lines[0].startsWith('NOTE')) {
      continue;
    }

    // Line with time arrow -->
    let timeLineIndex = lines.findIndex(l => l.includes('-->'));
    if (timeLineIndex === -1) continue;

    const timeLine = lines[timeLineIndex];
    const [startRaw, endRaw] = timeLine.split('-->');
    if (!startRaw || !endRaw) continue;

    // Clean any formatting tags like align:center etc.
    const cleanEnd = endRaw.trim().split(/\s+/)[0];

    const startTime = parseTimestampToSeconds(startRaw.trim());
    const endTime = parseTimestampToSeconds(cleanEnd);

    // Text lines are everything after the timeLine
    const textLines = lines.slice(timeLineIndex + 1);
    // Remove HTML tags like <i>, <b>, <font>
    const text = textLines
      .join('\n')
      .replace(/<[^>]*>/g, '')
      .trim();

    if (text && endTime > startTime) {
      cues.push({
        id: cueIndex++,
        startTime,
        endTime,
        text,
      });
    }
  }

  return cues;
}
