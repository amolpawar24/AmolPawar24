const fs = require("fs");

const username = process.env.GH_USERNAME;
const token = process.env.GH_TOKEN;

if (!username || !token) {
  throw new Error("GH_USERNAME or GH_TOKEN is missing.");
}

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

async function github(url) {
  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(
      `GitHub API Error: ${response.status} ${response.statusText}`
    );
  }

  return response.json();
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatNumber(number) {
  return new Intl.NumberFormat("en-IN").format(number);
}

function getRelativeTime(dateString) {
  const date = new Date(dateString);
  const now = new Date();

  const seconds = Math.floor((now - date) / 1000);

  if (seconds < 60) return "Just now";

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours} hr ago`;
  }

  const days = Math.floor(hours / 24);

  if (days < 30) {
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }

  const months = Math.floor(days / 30);

  if (months < 12) {
    return `${months} month${months === 1 ? "" : "s"} ago`;
  }

  const years = Math.floor(months / 12);

  return `${years} year${years === 1 ? "" : "s"} ago`;
}

/* -----------------------------------------
   GET ALL REPOSITORIES
------------------------------------------ */

async function getRepositories() {
  let repositories = [];
  let page = 1;

  while (true) {
    const data = await github(
      `https://api.github.com/users/${username}/repos?per_page=100&page=${page}&sort=updated`
    );

    if (!data.length) {
      break;
    }

    repositories.push(...data);

    if (data.length < 100) {
      break;
    }

    page++;
  }

  return repositories.filter((repo) => !repo.fork);
}

/* -----------------------------------------
   GET LANGUAGE STATISTICS
------------------------------------------ */

async function getLanguages(repositories) {
  const languageTotals = {};

  for (const repo of repositories) {
    try {
      const languages = await github(
        `https://api.github.com/repos/${username}/${repo.name}/languages`
      );

      for (const [language, bytes] of Object.entries(languages)) {
        languageTotals[language] =
          (languageTotals[language] || 0) + bytes;
      }
    } catch {
      console.log(`Skipping languages for ${repo.name}`);
    }
  }

  return languageTotals;
}

/* -----------------------------------------
   CODE DISTRIBUTION
------------------------------------------ */

function createLanguageStats(languageTotals) {
  const totalBytes = Object.values(languageTotals).reduce(
    (sum, value) => sum + value,
    0
  );

  if (!totalBytes) {
    return `
<p align="center">
No language statistics available.
</p>
`;
  }

  const languages = Object.entries(languageTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  const badges = languages
    .map(([language, bytes]) => {
      const percentage = ((bytes / totalBytes) * 100).toFixed(1);

      return `
<a href="#">
<img
src="https://img.shields.io/badge/${encodeURIComponent(
        language
      )}-${percentage}%25-0969DA?style=flat-square"
alt="${escapeHtml(language)} ${percentage}%"
/>
</a>
`;
    })
    .join(" ");

  return `
<div align="center">

${badges}

</div>

<br>

<table align="center">

${languages
  .map(([language, bytes]) => {
    const percentage = ((bytes / totalBytes) * 100).toFixed(1);

    return `
<tr>
<td><strong>${escapeHtml(language)}</strong></td>
<td align="right"><strong>${percentage}%</strong></td>
</tr>
`;
  })
  .join("")}

</table>
`;
}

/* -----------------------------------------
   TOP REPOSITORIES
------------------------------------------ */

function createTopRepositories(repositories) {
  const topRepositories = [...repositories]
    .sort(
      (a, b) =>
        b.stargazers_count - a.stargazers_count ||
        b.forks_count - a.forks_count ||
        new Date(b.pushed_at) - new Date(a.pushed_at)
    )
    .slice(0, 5);

  if (!topRepositories.length) {
    return `
<p align="center">
No repositories found.
</p>
`;
  }

  return `
<table width="100%">

<tr>
<th align="center">#</th>
<th>Repository</th>
<th align="center">Language</th>
<th align="center">⭐</th>
<th align="center">🍴</th>
</tr>

${topRepositories
  .map(
    (repo, index) => `
<tr>

<td align="center">
<strong>${index + 1}</strong>
</td>

<td>
<a href="${repo.html_url}">
<strong>${escapeHtml(repo.name)}</strong>
</a>
${
  repo.description
    ? `<br><sub>${escapeHtml(repo.description)}</sub>`
    : ""
}
</td>

<td align="center">
${escapeHtml(repo.language || "—")}
</td>

<td align="center">
${formatNumber(repo.stargazers_count)}
</td>

<td align="center">
${formatNumber(repo.forks_count)}
</td>

</tr>
`
  )
  .join("")}

</table>
`;
}

/* -----------------------------------------
   RECENTLY UPDATED
------------------------------------------ */

function createRecentRepositories(repositories) {
  const recentRepositories = [...repositories]
    .sort(
      (a, b) =>
        new Date(b.pushed_at) - new Date(a.pushed_at)
    )
    .slice(0, 6);

  if (!recentRepositories.length) {
    return `
<p align="center">
No recent activity available.
</p>
`;
  }

  return `
<table width="100%">

<tr>
<th>Repository</th>
<th align="center">Language</th>
<th align="right">Updated</th>
</tr>

${recentRepositories
  .map(
    (repo) => `
<tr>

<td>
<a href="${repo.html_url}">
<strong>${escapeHtml(repo.name)}</strong>
</a>
</td>

<td align="center">
${escapeHtml(repo.language || "—")}
</td>

<td align="right">
<sub>${getRelativeTime(repo.pushed_at)}</sub>
</td>

</tr>
`
  )
  .join("")}

</table>
`;
}

/* -----------------------------------------
   MAIN
------------------------------------------ */

async function main() {
  console.log("🚀 Starting GitHub Profile Dashboard...");

  const user = await github(
    `https://api.github.com/users/${username}`
  );

  console.log("✅ User information loaded.");

  const repositories = await getRepositories();

  console.log(
    `✅ Found ${repositories.length} repositories.`
  );

  const languages = await getLanguages(repositories);

  console.log("✅ Language statistics loaded.");

  const totalStars = repositories.reduce(
    (total, repo) =>
      total + repo.stargazers_count,
    0
  );

  const totalForks = repositories.reduce(
    (total, repo) =>
      total + repo.forks_count,
    0
  );

  const totalIssues = repositories.reduce(
    (total, repo) =>
      total + repo.open_issues_count,
    0
  );

  const topRepositories =
    createTopRepositories(repositories);

  const languageStats =
    createLanguageStats(languages);

  const recentRepositories =
    createRecentRepositories(repositories);

  const generatedAt = new Date().toLocaleString(
    "en-IN",
    {
      timeZone: "Asia/Kolkata",
      dateStyle: "medium",
      timeStyle: "short",
    }
  );

  /* -----------------------------------------
     DASHBOARD
  ------------------------------------------ */

  const dashboard = `<!--START_SECTION:github-dashboard-->

<div align="center">

# 📊 GitHub Dashboard

### 👨‍💻 ${escapeHtml(user.name || username)}

<p>
<strong>Frontend Developer • React.js • JavaScript • Node.js</strong>
</p>

<p>
<a href="https://github.com/${username}">
<img src="https://img.shields.io/badge/GitHub-${username}-181717?style=flat-square&logo=github" />
</a>
</p>

</div>

<br>

<!-- PROFILE STATS -->

<table align="center">

<tr>

<td align="center">
<strong>📦 ${formatNumber(
    repositories.length
  )}</strong>
<br>
<sub>Repositories</sub>
</td>

<td align="center">
<strong>⭐ ${formatNumber(
    totalStars
  )}</strong>
<br>
<sub>Stars</sub>
</td>

<td align="center">
<strong>🍴 ${formatNumber(
    totalForks
  )}</strong>
<br>
<sub>Forks</sub>
</td>

<td align="center">
<strong>👥 ${formatNumber(
    user.followers
  )}</strong>
<br>
<sub>Followers</sub>
</td>

<td align="center">
<strong>👀 ${formatNumber(
    user.following
  )}</strong>
<br>
<sub>Following</sub>
</td>

</tr>

</table>

<br>

## 🏆 Top Repositories

${topRepositories}

<br>

## 💻 Code Distribution

<p>
Languages detected across repository source code.
</p>

${languageStats}

<br>

## 🚀 Recent Activity

${recentRepositories}

<br>

## 📈 GitHub Overview

<table width="100%">

<tr>

<td align="center">
<strong>📦 ${formatNumber(
    repositories.length
  )}</strong>
<br>
<sub>Public Repositories</sub>
</td>

<td align="center">
<strong>⭐ ${formatNumber(
    totalStars
  )}</strong>
<br>
<sub>Total Stars</sub>
</td>

<td align="center">
<strong>🍴 ${formatNumber(
    totalForks
  )}</strong>
<br>
<sub>Total Forks</sub>
</td>

<td align="center">
<strong>🐛 ${formatNumber(
    totalIssues
  )}</strong>
<br>
<sub>Open Issues</sub>
</td>

</tr>

</table>

<br>

<div align="center">

<sub>
⚡ Automatically updated using GitHub Actions
</sub>

<br>

<sub>
Last updated: ${generatedAt} IST
</sub>

</div>

<!--END_SECTION:github-dashboard-->`;

  /* -----------------------------------------
     UPDATE README
  ------------------------------------------ */

  const readmePath = "README.md";

  if (!fs.existsSync(readmePath)) {
    throw new Error("README.md was not found.");
  }

  let readme = fs.readFileSync(
    readmePath,
    "utf8"
  );

  const startMarker =
    "<!--START_SECTION:github-dashboard-->";

  const endMarker =
    "<!--END_SECTION:github-dashboard-->";

  const startIndex =
    readme.indexOf(startMarker);

  const endIndex =
    readme.indexOf(endMarker);

  if (startIndex === -1 || endIndex === -1) {
    throw new Error(
      `Dashboard markers were not found in README.md.

Please add:

${startMarker}
${endMarker}`
    );
  }

  const before =
    readme.substring(0, startIndex);

  const after =
    readme.substring(
      endIndex + endMarker.length
    );

  readme =
    before +
    dashboard +
    after;

  fs.writeFileSync(
    readmePath,
    readme,
    "utf8"
  );

  console.log(
    "✅ GitHub Profile Dashboard updated successfully!"
  );
}

main().catch((error) => {
  console.error(
    "❌ Dashboard update failed:"
  );

  console.error(error);

  process.exit(1);
});
