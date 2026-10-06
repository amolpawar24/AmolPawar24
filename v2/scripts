/**
 * scripts/generate-dashboard.js
 *
 * Generates the full "GitHub Dashboard" section of README.md, including:
 *   - GitHub Statistics (repos, stars, forks, followers, open issues)
 *   - Top Repositories (by stars)
 *   - Code Distribution (real byte-level language breakdown across repos)
 *   - Recent Repository Activity (most recently pushed repos)
 *   - Repository Commits (default-branch commit counts, sorted desc, + total)
 *
 * Replaces ONLY the content between:
 *   <!--START_SECTION:github-dashboard-->
 *   <!--END_SECTION:github-dashboard-->
 * in README.md. Safe to run repeatedly — it never duplicates the section.
 *
 * Requires:
 *   GH_USERNAME - the GitHub username whose profile this dashboard belongs to
 *   GH_TOKEN    - a GitHub token with public repo read access (GITHUB_TOKEN is fine)
 *
 * NOTE ON FRESHNESS:
 * GitHub's own systems (Linguist language detection, the repo list cache, etc.)
 * can lag a few minutes behind a push. If this workflow is triggered immediately
 * `on: push`, consider ALSO adding a `schedule:` cron trigger so a later re-run
 * catches up on any numbers GitHub hadn't finished recomputing yet.
 */

const fs = require("fs");
const path = require("path");

const username = process.env.GH_USERNAME;
const token = process.env.GH_TOKEN;

if (!username || !token) {
  console.error("Missing GH_USERNAME or GH_TOKEN environment variables.");
  process.exit(1);
}

const README_PATH = path.join(__dirname, "..", "README.md");
const START_MARKER = "<!--START_SECTION:github-dashboard-->";
const END_MARKER = "<!--END_SECTION:github-dashboard-->";

const API_BASE = "https://api.github.com";
const headers = {
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": `${username}-dashboard-generator`,
};

/**
 * Thin wrapper around fetch() that adds auth headers and throws on
 * non-2xx responses, so every caller doesn't have to repeat this check.
 */
async function githubRequest(url) {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`GitHub API request failed (${res.status}): ${url}`);
  }
  return res;
}

/** Convenience helper for endpoints where we only care about the JSON body. */
async function githubJson(url) {
  const res = await githubRequest(url);
  return res.json();
}

/** Fetch all public repos for the user (handles pagination). */
async function fetchAllRepos() {
  let page = 1;
  const perPage = 100;
  const repos = [];

  while (true) {
    const url = `${API_BASE}/users/${username}/repos?per_page=${perPage}&page=${page}&type=owner`;
    const data = await githubJson(url);
    if (!Array.isArray(data) || data.length === 0) break;
    repos.push(...data);
    if (data.length < perPage) break;
    page += 1;
  }

  return repos;
}

/** Fetch the public profile info for the user (used for the followers count). */
async function fetchUserProfile() {
  return githubJson(`${API_BASE}/users/${username}`);
}

/**
 * Fetch the byte-level language breakdown for a single repo, e.g.
 *   { "JavaScript": 48213, "CSS": 9021, "HTML": 4110 }
 *
 * This is GitHub's authoritative "how many bytes of each language exist in
 * this repo" data (the same numbers GitHub uses for the language bar on the
 * repo page). It's a much better source of truth for a dashboard than
 * `repo.language`, which is only GitHub's single guess at each repo's ONE
 * dominant language and doesn't move at all unless that guess flips.
 */
async function fetchRepoLanguages(repoName) {
  try {
    return await githubJson(`${API_BASE}/repos/${username}/${repoName}/languages`);
  } catch (err) {
    // A repo can 404/error here (e.g. just-deleted, permissions edge case).
    // Don't let one bad repo kill the whole dashboard build.
    console.warn(`Skipping languages for ${repoName}: ${err.message}`);
    return {};
  }
}

/**
 * Count commits on a repo's default branch using the commits endpoint.
 * Uses per_page=1 and reads the "last page" number from the Link header,
 * which avoids paging through every commit individually.
 */
async function countCommits(repoName, defaultBranch) {
  const url = `${API_BASE}/repos/${username}/${repoName}/commits?sha=${encodeURIComponent(
    defaultBranch
  )}&per_page=1`;

  const res = await githubRequest(url);
  const link = res.headers.get("link");

  if (link) {
    const match = link.match(/&page=(\d+)>; rel="last"/);
    if (match) {
      return parseInt(match[1], 10);
    }
  }

  // No Link header means there's just the one page we already fetched.
  const data = await res.json();
  return Array.isArray(data) ? data.length : 0;
}

/** Escape pipe characters so table cell content can't break Markdown tables. */
function escapeMd(text) {
  return (text || "").replace(/\|/g, "\\|");
}

/** Trim long repo descriptions down to a readable length for the table. */
function truncate(text, max = 100) {
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max).trim()}...` : text;
}

/** Turn an ISO date string into a short human-relative label ("3 hrs ago"). */
function formatRelativeTime(dateString) {
  const date = new Date(dateString);
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min${diffMins === 1 ? "" : "s"} ago`;
  if (diffHours < 24) return `${diffHours} hr${diffHours === 1 ? "" : "s"} ago`;
  if (diffDays < 30) return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  return date.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

/** Build the top-of-dashboard stat cards (repo count, stars, forks, etc). */
function buildStatsSection({ repoCount, stars, forks, followers, openIssues }) {
  return `### ⚡ GitHub Statistics

<p>
<sub>Automatically generated from GitHub data</sub>
</p>

</div>

<table align="center">

<tr>

<td align="center">
<strong>📦 ${repoCount}</strong>
<br>
<sub>Repositories</sub>
</td>

<td align="center">
<strong>⭐ ${stars}</strong>
<br>
<sub>Stars</sub>
</td>

<td align="center">
<strong>🍴 ${forks}</strong>
<br>
<sub>Forks</sub>
</td>

<td align="center">
<strong>👥 ${followers}</strong>
<br>
<sub>Followers</sub>
</td>

<td align="center">
<strong>🐛 ${openIssues}</strong>
<br>
<sub>Open Issues</sub>
</td>

</tr>

</table>`;
}

/** Build the "Top Repositories" table, ranked by stargazer count. */
function buildTopReposSection(repos) {
  const top = [...repos].sort((a, b) => b.stargazers_count - a.stargazers_count).slice(0, 6);

  const rows = top
    .map((repo, i) => {
      const desc = repo.description ? `\n<br>\n<sub>${escapeMd(truncate(repo.description))}</sub>` : "";
      return `<tr>
<td align="center"><strong>${i + 1}</strong></td>
<td>
<a href="${repo.html_url}"><strong>${repo.name}</strong></a>${desc}
</td>
<td align="center"><sub>${repo.language || "—"}</sub></td>
<td align="center">${repo.stargazers_count}</td>
<td align="center">${repo.forks_count}</td>
</tr>`;
    })
    .join("\n\n");

  return `### 🏆 Top Repositories

<table width="100%">

<tr>
<th align="center">#</th>
<th>Repository</th>
<th align="center">Language</th>
<th align="center">⭐</th>
<th align="center">🍴</th>
</tr>

${rows}

</table>`;
}

/**
 * Build the "Code Distribution" section using REAL byte counts per language,
 * summed across every repo (via the /languages endpoint), rather than just
 * counting how many repos list a given language as their single primary one.
 *
 * This is async because it has to make one extra API call per repo.
 */
async function buildCodeDistributionSection(repos) {
  const totals = {};

  // Fetch language byte-breakdowns for every repo and accumulate totals.
  // Done sequentially to stay well within GitHub's rate limits; if you have
  // a large number of repos you could batch these with Promise.all in
  // small chunks instead.
  for (const repo of repos) {
    const langs = await fetchRepoLanguages(repo.name); // e.g. { JavaScript: 48213, CSS: 9021 }
    for (const [lang, bytes] of Object.entries(langs)) {
      totals[lang] = (totals[lang] || 0) + bytes;
    }
  }

  const totalBytes = Object.values(totals).reduce((a, b) => a + b, 0) || 1;

  const sorted = Object.entries(totals)
    .map(([language, bytes]) => ({ language, pct: (bytes / totalBytes) * 100 }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 6);

  const badges = sorted
    .map(
      ({ language, pct }) =>
        `<img src="https://img.shields.io/badge/${encodeURIComponent(language)}-${pct.toFixed(
          1
        )}%25-6D28D9?style=flat-square" alt="${language}" />`
    )
    .join("\n");

  const rows = sorted
    .map(
      ({ language, pct }) =>
        `<tr>\n<td><strong>${language}</strong></td>\n<td align="right"><strong>${pct.toFixed(
          1
        )}%</strong></td>\n</tr>`
    )
    .join("\n\n");

  return `### 💻 Code Distribution

<div align="center">

${badges}

</div>

<br>

<table width="100%">

<tr>
<th>Language</th>
<th align="right">Usage</th>
</tr>

${rows}

</table>`;
}

/** Build the "Recent Repository Activity" table, ranked by last push time. */
function buildRecentActivitySection(repos) {
  const recent = [...repos]
    .sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at))
    .slice(0, 6);

  const rows = recent
    .map(
      (repo) => `<tr>
<td><a href="${repo.html_url}"><strong>${repo.name}</strong></a></td>
<td align="center"><sub>${repo.language || "—"}</sub></td>
<td align="right"><sub>${formatRelativeTime(repo.pushed_at)}</sub></td>
</tr>`
    )
    .join("\n\n");

  return `### 🚀 Recent Repository Activity

<table width="100%">

<tr>
<th>Repository</th>
<th align="center">Language</th>
<th align="right">Updated</th>
</tr>

${rows}

</table>`;
}

/** Build the "Repository Commits" table (per-repo commit counts + total). */
async function buildCommitsSection(repos) {
  const results = [];

  for (const repo of repos) {
    try {
      const commits = await countCommits(repo.name, repo.default_branch);
      results.push({ name: repo.name, url: repo.html_url, commits });
    } catch (err) {
      // Empty repos (no commits yet) 409, or other transient errors: skip gracefully.
      console.warn(`Skipping commit count for ${repo.name}: ${err.message}`);
      results.push({ name: repo.name, url: repo.html_url, commits: 0 });
    }
  }

  results.sort((a, b) => b.commits - a.commits);
  const total = results.reduce((sum, r) => sum + r.commits, 0);

  const rows = results
    .map(
      (r) => `<tr>
<td><a href="${r.url}"><strong>${r.name}</strong></a></td>
<td align="right">${r.commits}</td>
</tr>`
    )
    .join("\n\n");

  return `### 📊 Repository Commits

<div align="center">

<img src="https://img.shields.io/badge/Total%20Commits-${total}-6D28D9?style=for-the-badge&logo=github&logoColor=white" />
<img src="https://img.shields.io/badge/Repositories-${results.length}-06B6D4?style=for-the-badge&logo=github&logoColor=white" />

</div>

<br>

<table width="100%">

<tr>
<th>📦 Repository</th>
<th align="right">💻 Commits</th>
</tr>

${rows}

<tr>
<td><strong>Total</strong></td>
<td align="right"><strong>${total}</strong></td>
</tr>

</table>`;
}

/** Format "now" as an IST-localized timestamp for the "Last updated" footer. */
function formatTimestamp() {
  return new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Fetch all the data needed for the dashboard and assemble the final
 * HTML/Markdown block that gets spliced into README.md.
 */
async function buildDashboard() {
  const [profile, allRepos] = await Promise.all([fetchUserProfile(), fetchAllRepos()]);

  // Only non-fork, non-archived public repos count toward the dashboard.
  const repos = allRepos.filter((r) => !r.fork && !r.archived);

  const stars = repos.reduce((sum, r) => sum + r.stargazers_count, 0);
  const forks = repos.reduce((sum, r) => sum + r.forks_count, 0);
  const openIssues = repos.reduce((sum, r) => sum + r.open_issues_count, 0);

  const statsSection = buildStatsSection({
    repoCount: repos.length,
    stars,
    forks,
    followers: profile.followers,
    openIssues,
  });

  const topReposSection = buildTopReposSection(repos);

  // Both of these make per-repo API calls, so they're awaited.
  const codeDistributionSection = await buildCodeDistributionSection(repos);
  const commitsSection = await buildCommitsSection(repos);

  const recentActivitySection = buildRecentActivitySection(repos);

  return `<div align="center">

${statsSection}

<br>

${topReposSection}

<br>

${codeDistributionSection}

<br>

${recentActivitySection}

<br>

${commitsSection}

<br>

<div align="center">

<sub>🕐 Last updated: ${formatTimestamp()} IST</sub>

<br>

<sub>🤖 Powered by GitHub Actions</sub>

</div>`;
}

/**
 * Splice the freshly-built dashboard content between the START/END markers
 * in README.md, leaving everything else in the file untouched.
 */
function replaceDashboardSection(readme, newContent) {
  const startIdx = readme.indexOf(START_MARKER);
  const endIdx = readme.indexOf(END_MARKER);

  if (startIdx === -1 || endIdx === -1) {
    throw new Error(
      `Could not find ${START_MARKER} / ${END_MARKER} markers in README.md. Add them once, manually, before running this script.`
    );
  }

  const before = readme.slice(0, startIdx + START_MARKER.length);
  const after = readme.slice(endIdx);

  return `${before}\n\n${newContent}\n\n${after}`;
}

async function main() {
  const readme = fs.readFileSync(README_PATH, "utf8");
  const dashboardContent = await buildDashboard();
  const updated = replaceDashboardSection(readme, dashboardContent);
  fs.writeFileSync(README_PATH, updated, "utf8");
  console.log("✅ README.md GitHub Dashboard section updated.");
}

main().catch((err) => {
  console.error("❌ Failed to generate dashboard:", err);
  process.exit(1);
});
