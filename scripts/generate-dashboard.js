```javascript
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

  if (seconds < 60) {
    return "Just now";
  }

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
    } catch (error) {
      console.log(`Skipping languages: ${repo.name}`);
    }
  }

  return languageTotals;
}

function createLanguageStats(languageTotals) {
  const totalBytes = Object.values(languageTotals).reduce(
    (sum, value) => sum + value,
    0
  );

  if (!totalBytes) {
    return "<p>No language statistics available.</p>";
  }

  const languages = Object.entries(languageTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  return languages
    .map(([language, bytes]) => {
      const percentage = ((bytes / totalBytes) * 100).toFixed(1);

      return `
<tr>
<td width="150"><strong>${escapeHtml(language)}</strong></td>

<td width="400">

<div style="
background:#e5e7eb;
border-radius:20px;
height:10px;
overflow:hidden;
">

<div style="
width:${percentage}%;
height:100%;
background:linear-gradient(90deg,#6366f1,#8b5cf6);
border-radius:20px;
"></div>

</div>

</td>

<td align="right">
<strong>${percentage}%</strong>
</td>

</tr>
`;
    })
    .join("");
}

function createTopRepositories(repositories) {
  const topRepositories = [...repositories]
    .sort(
      (a, b) =>
        b.stargazers_count - a.stargazers_count ||
        b.forks_count - a.forks_count
    )
    .slice(0, 5);

  return topRepositories
    .map(
      (repo, index) => `
<tr>

<td align="center">
<strong>#${index + 1}</strong>
</td>

<td>
<a href="${repo.html_url}">
<strong>${escapeHtml(repo.name)}</strong>
</a>

<br>

<sub>
${escapeHtml(
  repo.description || "No repository description available."
)}
</sub>

</td>

<td align="center">
⭐ ${repo.stargazers_count}
</td>

<td align="center">
🍴 ${repo.forks_count}
</td>

<td align="center">
${escapeHtml(repo.language || "—")}
</td>

</tr>
`
    )
    .join("");
}

function createRecentRepositories(repositories) {
  return repositories
    .slice(0, 6)
    .map(
      (repo) => `
<tr>

<td>
<a href="${repo.html_url}">
<strong>${escapeHtml(repo.name)}</strong>
</a>
</td>

<td>
${escapeHtml(repo.language || "—")}
</td>

<td>
${getRelativeTime(repo.pushed_at)}
</td>

</tr>
`
    )
    .join("");
}

async function main() {
  console.log("🚀 Starting GitHub Profile Dashboard...");

  const user = await github(
    `https://api.github.com/users/${username}`
  );

  const repositories = await getRepositories();

  const languages = await getLanguages(repositories);

  const totalStars = repositories.reduce(
    (total, repo) => total + repo.stargazers_count,
    0
  );

  const totalForks = repositories.reduce(
    (total, repo) => total + repo.forks_count,
    0
  );

  const totalIssues = repositories.reduce(
    (total, repo) => total + repo.open_issues_count,
    0
  );

  const languageStats = createLanguageStats(languages);

  const topRepositories = createTopRepositories(repositories);

  const recentRepositories =
    createRecentRepositories(repositories);

  const generatedAt = new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });

  const dashboard = `

<!--START_SECTION:github-dashboard-->

<div align="center">

# 📊 GitHub Profile Dashboard

### 👨‍💻 ${escapeHtml(user.name || username)}

<p>
<strong>Full Stack Developer • React • JavaScript • Node.js</strong>
</p>

</div>

<br>

<table align="center">
<tr>

<td align="center" width="160">
<h2>📦 ${formatNumber(repositories.length)}</h2>
<sub>Repositories</sub>
</td>

<td align="center" width="160">
<h2>⭐ ${formatNumber(totalStars)}</h2>
<sub>Stars</sub>
</td>

<td align="center" width="160">
<h2>🍴 ${formatNumber(totalForks)}</h2>
<sub>Forks</sub>
</td>

<td align="center" width="160">
<h2>👥 ${formatNumber(user.followers)}</h2>
<sub>Followers</sub>
</td>

<td align="center" width="160">
<h2>👀 ${formatNumber(user.following)}</h2>
<sub>Following</sub>
</td>

</tr>
</table>

<br>

## 🏆 Top Repositories

<table width="100%">

<tr>
<th>#</th>
<th>Repository</th>
<th>Stars</th>
<th>Forks</th>
<th>Language</th>
</tr>

${topRepositories}

</table>

<br>

## 💻 Most Used Languages

<table width="100%">

${languageStats}

</table>

<br>

## 🚀 Recently Updated

<table width="100%">

<tr>
<th>Repository</th>
<th>Language</th>
<th>Activity</th>
</tr>

${recentRepositories}

</table>

<br>

## 📈 GitHub Overview

<table width="100%">

<tr>

<td align="center">
<h3>📦 ${formatNumber(repositories.length)}</h3>
<sub>Public Repositories</sub>
</td>

<td align="center">
<h3>⭐ ${formatNumber(totalStars)}</h3>
<sub>Total Stars</sub>
</td>

<td align="center">
<h3>🍴 ${formatNumber(totalForks)}</h3>
<sub>Total Forks</sub>
</td>

<td align="center">
<h3>🐛 ${formatNumber(totalIssues)}</h3>
<sub>Open Issues</sub>
</td>

</tr>

</table>

<br>

<div align="center">

### ⚡ Automatically Updated

Last updated: **${generatedAt} IST**

<sub>
Generated automatically using GitHub Actions 🤖
</sub>

</div>

<!--END_SECTION:github-dashboard-->

`;

  const readmePath = "README.md";

  if (!fs.existsSync(readmePath)) {
    throw new Error("README.md was not found.");
  }

  let readme = fs.readFileSync(readmePath, "utf8");

  const startMarker =
    "<!--START_SECTION:github-dashboard-->";

  const endMarker =
    "<!--END_SECTION:github-dashboard-->";

  const startIndex = readme.indexOf(startMarker);
  const endIndex = readme.indexOf(endMarker);

  if (startIndex === -1 || endIndex === -1) {
    throw new Error(
      `Dashboard markers not found.

Add these markers to README.md:

${startMarker}
${endMarker}`
    );
  }

  const before = readme.substring(0, startIndex);

  const after = readme.substring(
    endIndex + endMarker.length
  );

  readme =
    before +
    dashboard.trim() +
    after;

  fs.writeFileSync(readmePath, readme);

  console.log(
    "✅ GitHub Profile Dashboard updated successfully!"
  );
}

main().catch((error) => {
  console.error("❌ Dashboard update failed:");
  console.error(error);
  process.exit(1);
});
```
