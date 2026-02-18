/**
 * Onboarding Store
 * Caches prerequisite check results in localStorage and tracks skip state.
 */

const STORAGE_KEY = 'squad-onboarding';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface PrerequisiteResult {
	name: string;
	installed: boolean;
	version: string | null;
	required: boolean;
	fixHint: string;
}

interface OnboardingState {
	prerequisiteResults: PrerequisiteResult[] | null;
	prerequisitesCheckedAt: string | null;
	skipped: boolean;
}

function loadState(): OnboardingState {
	if (typeof window === 'undefined') {
		return { prerequisiteResults: null, prerequisitesCheckedAt: null, skipped: false };
	}
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) return JSON.parse(raw);
	} catch { /* ignore */ }
	return { prerequisiteResults: null, prerequisitesCheckedAt: null, skipped: false };
}

function saveState(state: OnboardingState) {
	if (typeof window === 'undefined') return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch { /* ignore */ }
}

let state = $state<OnboardingState>(loadState());

export function getPrerequisiteResults(): PrerequisiteResult[] | null {
	return state.prerequisiteResults;
}

export function isCacheValid(): boolean {
	if (!state.prerequisitesCheckedAt) return false;
	const elapsed = Date.now() - new Date(state.prerequisitesCheckedAt).getTime();
	return elapsed < CACHE_TTL_MS;
}

export function setPrerequisiteResults(results: PrerequisiteResult[]) {
	state = {
		...state,
		prerequisiteResults: results,
		prerequisitesCheckedAt: new Date().toISOString()
	};
	saveState(state);
}

export function isSetupSkipped(): boolean {
	return state.skipped;
}

export function skipSetup() {
	state = { ...state, skipped: true };
	saveState(state);
}

export function resetOnboarding() {
	state = { prerequisiteResults: null, prerequisitesCheckedAt: null, skipped: false };
	saveState(state);
}
