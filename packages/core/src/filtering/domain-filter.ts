/**
 * Domain filtering logic - applies allow/deny list rules
 */

import type { DomainRule } from "../types";
import { createLogger } from "../logger";

const log = createLogger("[PingOps DomainFilter]");

/**
 * Extracts domain from a URL
 */
function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname;
    log.debug("Extracted domain from URL", { url, domain });
    return domain;
  } catch {
    // If URL parsing fails, try to extract domain from string
    const match = url.match(/^(?:https?:\/\/)?([^/]+)/);
    const domain = match ? match[1] : "";
    log.debug("Extracted domain from URL (fallback)", { url, domain });
    return domain;
  }
}

/**
 * Checks if a domain matches a rule (exact or suffix match)
 */
function domainMatches(domain: string, ruleDomain: string): boolean {
  // Exact match
  if (domain === ruleDomain) {
    log.debug("Domain exact match", { domain, ruleDomain });
    return true;
  }

  // Suffix match (e.g., .github.com matches api.github.com)
  if (ruleDomain.startsWith(".")) {
    const matches =
      domain.endsWith(ruleDomain) || domain === ruleDomain.slice(1);
    log.debug("Domain suffix match check", { domain, ruleDomain, matches });
    return matches;
  }

  log.debug("Domain does not match", { domain, ruleDomain });
  return false;
}

/**
 * Checks if a path matches any of the allowed paths (prefix match)
 */
function pathMatches(path: string, allowedPaths?: string[]): boolean {
  if (!allowedPaths || allowedPaths.length === 0) {
    log.debug("No path restrictions, all paths match", { path });
    return true; // No path restrictions means all paths match
  }

  const matches = allowedPaths.some((allowedPath) =>
    path.startsWith(allowedPath)
  );
  log.debug("Path match check", { path, allowedPaths, matches });
  return matches;
}

/**
 * Determines if a span should be captured based on domain rules
 */
export function shouldCaptureSpan(
  url: string,
  domainAllowList?: DomainRule[],
  domainDenyList?: DomainRule[]
): boolean {
  log.debug("Checking domain filter rules", {
    url,
    hasAllowList: !!domainAllowList && domainAllowList.length > 0,
    hasDenyList: !!domainDenyList && domainDenyList.length > 0,
    allowListCount: domainAllowList?.length || 0,
    denyListCount: domainDenyList?.length || 0,
  });

  const domain = extractDomain(url);

  // Extract path from URL
  let path = "/";
  try {
    const urlObj = new URL(url);
    path = urlObj.pathname;
  } catch {
    // If URL parsing fails, try to extract path from string
    const pathMatch = url.match(/^(?:https?:\/\/)?[^/]+(\/.*)?$/);
    path = pathMatch && pathMatch[1] ? pathMatch[1] : "/";
  }

  log.debug("Extracted domain and path", { url, domain, path });

  // Deny list is evaluated first - if domain is denied, don't capture
  if (domainDenyList) {
    for (const rule of domainDenyList) {
      if (domainMatches(domain, rule.domain)) {
        log.info("Domain denied by deny list", {
          domain,
          ruleDomain: rule.domain,
          url,
        });
        return false;
      }
    }
    log.debug("Domain passed deny list check", { domain });
  }

  // If no allow list, capture all (except denied)
  if (!domainAllowList || domainAllowList.length === 0) {
    log.debug("No allow list configured, capturing span", { domain, url });
    return true;
  }

  // Check if domain matches any allow list rule
  for (const rule of domainAllowList) {
    if (domainMatches(domain, rule.domain)) {
      // If paths are specified, check path match
      if (rule.paths && rule.paths.length > 0) {
        const pathMatch = pathMatches(path, rule.paths);
        if (pathMatch) {
          log.info("Domain and path allowed by allow list", {
            domain,
            ruleDomain: rule.domain,
            path,
            allowedPaths: rule.paths,
            url,
          });
          return true;
        } else {
          log.debug("Domain allowed but path not matched", {
            domain,
            ruleDomain: rule.domain,
            path,
            allowedPaths: rule.paths,
          });
        }
      } else {
        log.info("Domain allowed by allow list", {
          domain,
          ruleDomain: rule.domain,
          url,
        });
        return true;
      }
    }
  }

  // Domain not in allow list
  log.info("Domain not in allow list, filtering out", { domain, url });
  return false;
}
