// robots.txt for UA `*`. The text comes from the user's own Chrome (the
// extension reads /robots.txt), never from a server-side request. Anything the
// parser cannot read as robots is "unreadable", and the host is closed.

export interface Robots {
  rules: { allow: boolean; pattern: string }[];
  crawlDelaySec: number | null;
}

export type RobotsParse = { ok: true; robots: Robots } | { ok: false; reason: string };

export function parseRobots(text: string, status: number | null): RobotsParse {
  if (status !== 200) return { ok: false, reason: `robots_status_${status ?? 'unknown'}` };
  const body = text.replace(/^﻿/, '');
  if (body.trim() === '') return { ok: false, reason: 'robots_empty' };
  if (/<\s*(?:!doctype|html|head|body)\b/i.test(body)) return { ok: false, reason: 'robots_not_text' };
  const lines = body.split(/\r?\n/).map((line) => line.replace(/#.*$/, '').trim()).filter(Boolean);
  let sawAgent = false;
  let inStar = false;
  let groupOpen = false;
  const rules: Robots['rules'] = [];
  let crawlDelaySec: number | null = null;
  for (const line of lines) {
    const at = line.indexOf(':');
    if (at < 0) continue;
    const key = line.slice(0, at).trim().toLowerCase();
    const value = line.slice(at + 1).trim();
    if (key === 'user-agent') {
      sawAgent = true;
      // Consecutive User-agent lines share one group.
      inStar = groupOpen ? inStar || value === '*' : value === '*';
      groupOpen = true;
      continue;
    }
    groupOpen = false;
    if (!inStar) continue;
    if (key === 'allow' || key === 'disallow') {
      // An empty Disallow means "allow everything" and adds no rule.
      if (value !== '') rules.push({ allow: key === 'allow', pattern: value });
    } else if (key === 'crawl-delay') {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds >= 0) crawlDelaySec = seconds;
    }
  }
  if (!sawAgent) return { ok: false, reason: 'robots_unparseable' };
  return { ok: true, robots: { rules, crawlDelaySec } };
}

function matches(pattern: string, target: string): number {
  // `*` matches any run, a trailing `$` anchors the end. Returns match length.
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const escaped = body.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp(`^${escaped}${anchored ? '$' : ''}`).test(target) ? body.replace(/\*/g, '').length : -1;
}

/** Longest matching rule wins; Allow wins a tie; no match means allowed. */
export function robotsAllows(robots: Robots, pathAndQuery: string): boolean {
  let best = -1;
  let allowed = true;
  for (const rule of robots.rules) {
    const length = matches(rule.pattern, pathAndQuery);
    if (length < 0) continue;
    if (length > best || (length === best && rule.allow)) {
      best = length;
      allowed = rule.allow;
    }
  }
  return allowed;
}
