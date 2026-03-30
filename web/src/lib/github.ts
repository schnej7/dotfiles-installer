export interface GitHubRepo {
  full_name: string;
  name: string;
  owner: { login: string; avatar_url: string };
  description: string | null;
  stargazers_count: number;
  default_branch: string;
  html_url: string;
}

export interface GitHubTreeEntry {
  path: string;
  mode: string;
  type: "blob" | "tree";
  sha: string;
  size?: number;
  url: string;
}

export interface GitHubTree {
  sha: string;
  url: string;
  tree: GitHubTreeEntry[];
  truncated: boolean;
}

export interface RateLimitInfo {
  remaining: number;
  limit: number;
  resetAt: Date;
}

export class GitHubApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public rateLimit?: RateLimitInfo,
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

const API_BASE = "https://api.github.com";

function parseRateLimit(headers: Headers): RateLimitInfo {
  return {
    remaining: Number(headers.get("x-ratelimit-remaining") ?? 60),
    limit: Number(headers.get("x-ratelimit-limit") ?? 60),
    resetAt: new Date(
      Number(headers.get("x-ratelimit-reset") ?? 0) * 1000,
    ),
  };
}

async function apiFetch<T>(path: string, token?: string): Promise<{ data: T; rateLimit: RateLimitInfo }> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { headers });
  const rateLimit = parseRateLimit(res.headers);

  if (!res.ok) {
    if (res.status === 403 && rateLimit.remaining === 0) {
      const minutes = Math.ceil(
        (rateLimit.resetAt.getTime() - Date.now()) / 60_000,
      );
      throw new GitHubApiError(
        `GitHub API rate limit exceeded. Resets in ${minutes} minute(s).`,
        403,
        rateLimit,
      );
    }
    if (res.status === 404) {
      throw new GitHubApiError(
        "Repository not found. Make sure it exists and is public.",
        404,
        rateLimit,
      );
    }
    throw new GitHubApiError(
      `GitHub API error: ${res.status} ${res.statusText}`,
      res.status,
      rateLimit,
    );
  }

  const data = (await res.json()) as T;
  return { data, rateLimit };
}

export function parseRepoUrl(input: string): { owner: string; repo: string } | null {
  const cleaned = input.trim().replace(/\/+$/, "").replace(/\.git$/, "");

  const urlMatch = cleaned.match(
    /(?:https?:\/\/)?(?:www\.)?github\.com\/([^/]+)\/([^/]+)/,
  );
  if (urlMatch) return { owner: urlMatch[1]!, repo: urlMatch[2]! };

  const slugMatch = cleaned.match(/^([^/]+)\/([^/]+)$/);
  if (slugMatch) return { owner: slugMatch[1]!, repo: slugMatch[2]! };

  return null;
}

export async function fetchRepo(
  owner: string,
  repo: string,
  token?: string,
): Promise<{ repo: GitHubRepo; rateLimit: RateLimitInfo }> {
  const { data, rateLimit } = await apiFetch<GitHubRepo>(
    `/repos/${owner}/${repo}`,
    token,
  );
  return { repo: data, rateLimit };
}

export async function fetchTree(
  owner: string,
  repo: string,
  ref: string,
  token?: string,
): Promise<{ tree: GitHubTree; rateLimit: RateLimitInfo }> {
  const { data, rateLimit } = await apiFetch<GitHubTree>(
    `/repos/${owner}/${repo}/git/trees/${ref}?recursive=1`,
    token,
  );
  return { tree: data, rateLimit };
}

export async function fetchFileContent(
  owner: string,
  repo: string,
  ref: string,
  path: string,
  token?: string,
): Promise<string> {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path}`;
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
  return res.text();
}
