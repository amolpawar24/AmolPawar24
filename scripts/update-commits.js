// update-commits.js
// Fetches commit counts for all of a user's public repos and injects
// a markdown table into README.md between marker comments.

const fs = require("fs");
const https = require("https");

const USERNAME = process.env.GH_USERNAME;
const TOKEN = process.env.GH_TOKEN;
const README_PATH = "README.md";
const START_MARKER = "<!--START_SECTION:repo-commits-->";
const END_MARKER = "<!--END_SECTION:repo-commits-->";

function request(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.github.com",
      path,
      headers: {
        "User-Agent": "commit-count-script",
        Authorization: `token ${TOKEN}`,
        Accept: "application/vnd.github+json",
      },
    };
    https
      .get(options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          resolve({ body: data, headers: res.headers, status: res.statusCode });
        });
      })
      .on("error", reject);
  });
}

// Reads the "last" page number out of the Link header to get total commit count
function commitCountFromLinkHeader(headers, fallbackBody) {
  const link = headers["link"];
  if (!link) {
    // No pagination means 0 or 1 commit — count what's in body
    try {
      const arr = JSON.parse(fallbackBody);
      return Array.isArray(arr) ? arr.length : 0;
    } catch {
      return 0;
    }
  }
  const match = link.match(/&page=(\d+)>; rel="last"/);
  return match ? parseInt(match[1], 10) : 0;
}

async function getAllRepos() {
  let repos = [];
  let page = 1;
  while (true) {
    const res = await request(
      `/users/${USERNAME}/repos?per_page=100&page=${page}&type=owner`
    );
    const batch = JSON.parse(res.body);
    if (!Array.isArray(batch) || batch.length === 0) break;
    repos = repos.concat(batch);
    if (batch.length < 100) break;
    page++;
  }
  return repos.filter((r) => !r.fork); // skip forked repos
}

async function getCommitCount(repoName, defaultBranch) {
  const res = await request(
    `/repos/${USERNAME}/${repoName}/commits?sha=${defaultBranch}&per_page=1`
  );
  if (res.status !== 200) return 0;
  return commitCountFromLinkHeader(res.headers, res.body);
}

async function main() {
  const repos = await getAllRepos();

  const results = [];
  for (const repo of repos) {
    const count = await getCommitCount(repo.name, repo.default_branch || "main");
    results.push({ name: repo.name, commits: count, url: repo.html_url });
  }

  results.sort((a, b) => b.commits - a.commits);

  const totalCommits = results.reduce((sum, r) => sum + r.commits, 0);

  let table = `**Total commits across all repos: ${totalCommits}**\n\n`;
  table += "| Repository | Commits |\n";
  table += "|---|---|\n";
  for (const r of results) {
    table += `| [${r.name}](${r.url}) | ${r.commits} |\n`;
  }

  const readme = fs.readFileSync(README_PATH, "utf8");
  const startIdx = readme.indexOf(START_MARKER);
  const endIdx = readme.indexOf(END_MARKER);

  if (startIdx === -1 || endIdx === -1) {
    console.error(
      "Markers not found in README.md. Add START_SECTION:repo-commits and END_SECTION:repo-commits comments."
    );
    process.exit(1);
  }

  const before = readme.slice(0, startIdx + START_MARKER.length);
  const after = readme.slice(endIdx);
  const updated = `${before}\n\n${table}\n${after}`;

  fs.writeFileSync(README_PATH, updated);
  console.log(`Updated README with ${results.length} repos, ${totalCommits} total commits.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
