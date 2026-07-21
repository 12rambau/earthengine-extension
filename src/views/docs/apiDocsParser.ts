import * as https from 'https';

const API_DOCS_URL = 'https://developers.google.com/earth-engine/api_docs';

interface ApiEntry {
	name: string;
	id: string;
	description: string;
	usage: string;
	returns: string;
	args: { name: string; type: string; details: string }[];
}

let cachedEntries: ApiEntry[] | undefined;

export function clearDocsCache() {
	cachedEntries = undefined;
}

export async function fetchApiDocs(): Promise<ApiEntry[]> {
	if (cachedEntries) {
		return cachedEntries;
	}

	const html = await fetchHtml(API_DOCS_URL);
	cachedEntries = parseApiDocs(html);
	return cachedEntries;
}

function fetchHtml(url: string): Promise<string> {
	return new Promise((resolve, reject) => {
		https.get(url, (res) => {
			if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
				fetchHtml(res.headers.location).then(resolve, reject);
				return;
			}
			const chunks: Buffer[] = [];
			res.on('data', (chunk: Buffer) => chunks.push(chunk));
			res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
			res.on('error', reject);
		}).on('error', reject);
	});
}

function parseApiDocs(html: string): ApiEntry[] {
	const entries: ApiEntry[] = [];

	// Split by h2 tags that contain ee.* entries
	const h2Regex = /<h2[^>]*data-text="(ee\.[^"]+)"[^>]*>.*?<\/h2>/g;
	const matches = [...html.matchAll(h2Regex)];

	for (let i = 0; i < matches.length; i++) {
		const name = matches[i][1];
		const id = name.toLowerCase().replace(/\./g, '');
		const startIdx = matches[i].index! + matches[i][0].length;
		const endIdx = i + 1 < matches.length ? matches[i + 1].index! : html.length;
		const section = html.substring(startIdx, endIdx);

		// Extract description (first <p> after h2)
		const descMatch = section.match(/<p>(.*?)<\/p>/s);
		const description = descMatch
			? descMatch[1].replace(/<[^>]+>/g, '').trim()
			: '';

		// Extract usage and returns from first table
		const usageMatch = section.match(/<code[^>]*>(.*?)<\/code>.*?<\/td>\s*<td>(.*?)<\/td>/s);
		const usage = usageMatch
			? usageMatch[1].replace(/<[^>]+>/g, '').trim()
			: '';
		const returns = usageMatch
			? usageMatch[2].replace(/<[^>]+>/g, '').trim()
			: '';

		// Extract arguments from details table
		const args: ApiEntry['args'] = [];
		const argsTableMatch = section.match(/<table class="details">(.*?)<\/table>/s);
		if (argsTableMatch) {
			const rowRegex = /<tr><td>(.*?)<\/td><td>(.*?)<\/td><td>(.*?)<\/td><\/tr>/gs;
			for (const row of argsTableMatch[1].matchAll(rowRegex)) {
				args.push({
					name: row[1].replace(/<[^>]+>/g, '').trim(),
					type: row[2].replace(/<[^>]+>/g, '').trim(),
					details: row[3].replace(/<[^>]+>/g, '').trim(),
				});
			}
		}

		entries.push({ name, id, description, usage, returns, args });
	}

	return entries;
}

export function getDocUrl(apiName: string): string {
	const anchor = apiName.toLowerCase().replace(/\./g, '');
	return `${API_DOCS_URL}#${anchor}`;
}
