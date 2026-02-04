import { allPages } from '$lib/docs/config';

export function entries() {
	return allPages.map((p) => ({ slug: p.slug }));
}
