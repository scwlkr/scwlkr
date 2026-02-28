const url = 'https://scwlkr.com/bubba-dashboard/version.json';

console.log(`Checking deployment version at ${url}...`);

try {
    // Append a random timestamp to prevent the browser/node from caching this very request
    const fetchUrl = `${url}?t=${Date.now()}`;
    const response = await fetch(fetchUrl, { cache: 'no-store' });

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('✅ Deployment Check Success!');
    console.log(`➡️  Deployed Commit Hash: ${data.version}`);
    console.log(`➡️  Deployed At: ${data.date}`);
    console.log('\nIf this hash matches your latest commit on master, your new code is live!');
} catch (error) {
    console.error('❌ Error fetching version data:', error.message);
    console.error('The deployment might not be live yet, or cache is stuck serving an old version.');
}
