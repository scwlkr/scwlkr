#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const login = process.env.PROFILE_LOGIN || "scwlkr";

if (!token) {
  throw new Error("GH_TOKEN or GITHUB_TOKEN is required");
}

const query = `
  query ProfileSignal($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      repositories(
        first: 30
        privacy: PUBLIC
        ownerAffiliations: OWNER
        orderBy: { field: PUSHED_AT, direction: DESC }
      ) {
        totalCount
        nodes {
          name
          pushedAt
          isArchived
          isFork
        }
      }
      contributionsCollection(from: $from, to: $to) {
        contributionCalendar {
          totalContributions
        }
      }
    }
    openjob: repository(owner: "scwlkr", name: "openjob") {
      latestRelease {
        tagName
        publishedAt
      }
    }
    buoy: repository(owner: "WLKRLABS", name: "buoy") {
      latestRelease {
        tagName
        publishedAt
      }
    }
  }
`;

const now = new Date();
const from = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
const to = new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1));

const response = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "scwlkr-profile-black-box",
  },
  body: JSON.stringify({
    query,
    variables: {
      login,
      from: from.toISOString(),
      to: to.toISOString(),
    },
  }),
});

if (!response.ok) {
  throw new Error(`GitHub GraphQL request failed: ${response.status}`);
}

const payload = await response.json();
if (payload.errors?.length) {
  throw new Error(payload.errors.map((error) => error.message).join("; "));
}

const { user, openjob, buoy } = payload.data;
if (!user) {
  throw new Error(`GitHub user not found: ${login}`);
}

const recent = user.repositories.nodes
  .filter((repo) => !repo.isArchived && !repo.isFork && repo.name !== login)
  .slice(0, 3);

const releases = [
  ["OPENJOB", openjob?.latestRelease],
  ["BUOY", buoy?.latestRelease],
]
  .filter(([, release]) => release)
  .sort((a, b) => b[1].publishedAt.localeCompare(a[1].publishedAt));

const latestRelease = releases[0] || ["NO RELEASE", { tagName: "—", publishedAt: now.toISOString() }];
const year = now.getUTCFullYear();
const publicRepos = user.repositories.totalCount;
const contributions = user.contributionsCollection.contributionCalendar.totalContributions;
const latestPush = recent[0] || { name: "NO SIGNAL", pushedAt: now.toISOString() };

const xml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const shortDate = (value) => value.slice(0, 10).replaceAll("-", ".");
const count = (value) => new Intl.NumberFormat("en-US").format(value);

const rows = recent
  .map(
    (repo, index) => `
    <g transform="translate(58 ${246 + index * 45})">
      <text fill="#23CE6B" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="13" font-weight="800">0${index + 1}</text>
      <text x="46" fill="#FFFFFF" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="17" font-weight="800">${xml(repo.name.toUpperCase())}</text>
      <path d="M260 -6H1030" stroke="#FFFFFF" stroke-opacity=".08"/>
      <text x="1052" text-anchor="end" fill="#7F7F7F" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="13">${shortDate(repo.pushedAt)}</text>
    </g>`,
  )
  .join("");

const svg = `<svg width="1280" height="400" viewBox="0 0 1280 400" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc">
  <title id="title">SCWLKR black box recorder</title>
  <desc id="desc">A self-updating public GitHub activity panel showing repository count, ${year} contributions, latest release, and recent repository pushes.</desc>
  <defs>
    <pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse">
      <path d="M28 0H0V28" stroke="#FFFFFF" stroke-opacity=".035"/>
    </pattern>
    <linearGradient id="scan" x1="0" y1="0" x2="1" y2="0">
      <stop stop-color="#23CE6B" stop-opacity="0"/>
      <stop offset=".5" stop-color="#23CE6B"/>
      <stop offset="1" stop-color="#23CE6B" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="1280" height="400" rx="22" fill="#181818"/>
  <rect x="16" y="16" width="1248" height="368" rx="18" fill="url(#grid)" stroke="#FFFFFF" stroke-opacity=".16" stroke-width="1.5"/>
  <rect x="16" y="16" width="1248" height="4" rx="2" fill="url(#scan)"/>

  <text x="52" y="59" fill="#FFFFFF" font-family="Arial Black, Arial, sans-serif" font-size="27" font-weight="900">BLACK BOX RECORDER</text>
  <text x="52" y="86" fill="#7F7F7F" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="13">ACTION-GENERATED // PUBLIC GITHUB DATA // NO STAT-CARD DEPENDENCY</text>
  <circle cx="1210" cy="55" r="7" fill="#23CE6B"/>
  <text x="1188" y="60" text-anchor="end" fill="#23CE6B" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="12" font-weight="800">REC</text>

  <g transform="translate(52 111)">
    <rect width="262" height="88" rx="8" fill="#121212" stroke="#FFFFFF" stroke-opacity=".12"/>
    <text x="20" y="27" fill="#7F7F7F" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="11" font-weight="800" letter-spacing="1.5">PUBLIC MACHINES</text>
    <text x="20" y="70" fill="#FFFFFF" font-family="Arial Black, Arial, sans-serif" font-size="38" font-weight="900">${count(publicRepos)}</text>
  </g>
  <g transform="translate(326 111)">
    <rect width="262" height="88" rx="8" fill="#121212" stroke="#FFFFFF" stroke-opacity=".12"/>
    <text x="20" y="27" fill="#7F7F7F" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="11" font-weight="800" letter-spacing="1.5">${year} SIGNALS</text>
    <text x="20" y="70" fill="#23CE6B" font-family="Arial Black, Arial, sans-serif" font-size="38" font-weight="900">${count(contributions)}</text>
  </g>
  <g transform="translate(600 111)">
    <rect width="304" height="88" rx="8" fill="#121212" stroke="#FFFFFF" stroke-opacity=".12"/>
    <text x="20" y="27" fill="#7F7F7F" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="11" font-weight="800" letter-spacing="1.5">LATEST RELEASE</text>
    <text x="20" y="57" fill="#FFFFFF" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="19" font-weight="900">${xml(latestRelease[0])} ${xml(latestRelease[1].tagName)}</text>
    <text x="20" y="76" fill="#7F7F7F" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="11">${shortDate(latestRelease[1].publishedAt)}</text>
  </g>
  <g transform="translate(916 111)">
    <rect width="312" height="88" rx="8" fill="#121212" stroke="#23CE6B" stroke-opacity=".45"/>
    <text x="20" y="27" fill="#7F7F7F" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="11" font-weight="800" letter-spacing="1.5">LATEST PUSH</text>
    <text x="20" y="57" fill="#23CE6B" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="19" font-weight="900">${xml(latestPush.name.toUpperCase())}</text>
    <text x="20" y="76" fill="#7F7F7F" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="11">${shortDate(latestPush.pushedAt)}</text>
  </g>

  <text x="52" y="225" fill="#23CE6B" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="12" font-weight="800" letter-spacing="2">RECENT TRANSMISSIONS</text>
  ${rows}
</svg>
`;

await writeFile(resolve("assets/black-box.svg"), svg);
