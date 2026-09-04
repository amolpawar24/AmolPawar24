/**
 * scripts/generate-dashboard.js
 *
 * Generates the full "GitHub Dashboard" section of README.md, including:
 *   - GitHub Statistics (repos, stars, forks, followers, open issues)
 *   - Top Repositories (by stars)
 *   - Code Distribution (language breakdown across repos)
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

async function githubRequest(url) {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`GitHub API request failed (${res.status}): ${url}`);
  }
  return res;
}

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

/** Fetch the authenticated-ish public profile info for the user. */
async function fetchUserProfile() {
  return githubJson(`${API_BASE}/users/${username}`);
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

function escapeMd(text) {
  return (text || "").replace(/\|/g, "\\|");
}

function truncate(text, max = 100) {
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max).trim()}...` : text;
}

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

function buildCodeDistributionSection(repos) {
  const byLanguage = {};
  for (const repo of repos) {
    if (!repo.language) continue;
    byLanguage[repo.language] = (byLanguage[repo.language] || 0) + 1;
  }

  const total = Object.values(byLanguage).reduce((a, b) => a + b, 0) || 1;
  const sorted = Object.entries(byLanguage)
    .map(([language, count]) => ({ language, pct: (count / total) * 100 }))
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
    .map(({ language, pct }) => `<tr>\n<td><strong>${language}</strong></td>\n<td align="right"><strong>${pct.toFixed(1)}%</strong></td>\n</tr>`)
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
  const codeDistributionSection = buildCodeDistributionSection(repos);
  const recentActivitySection = buildRecentActivitySection(repos);
  const commitsSection = await buildCommitsSection(repos);

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
