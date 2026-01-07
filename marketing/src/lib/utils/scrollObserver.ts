/**
 * Scroll Observer Utility
 * Provides intersection-observer-based scroll animations
 */

export interface ScrollObserverOptions {
	threshold?: number | number[];
	rootMargin?: string;
	once?: boolean;
}

export type ScrollCallback = (entry: IntersectionObserverEntry) => void;

/**
 * Creates an intersection observer that tracks element visibility
 */
export function createScrollObserver(
	callback: ScrollCallback,
	options: ScrollObserverOptions = {}
): IntersectionObserver {
	const { threshold = 0.1, rootMargin = '0px', once = true } = options;

	const observer = new IntersectionObserver(
		(entries) => {
			entries.forEach((entry) => {
				callback(entry);
				if (once && entry.isIntersecting) {
					observer.unobserve(entry.target);
				}
			});
		},
		{ threshold, rootMargin }
	);

	return observer;
}

/**
 * Svelte action for scroll-triggered visibility
 * Usage: <div use:scrollReveal={{ delay: 200 }}>
 */
export function scrollReveal(
	node: HTMLElement,
	params: { delay?: number; duration?: number; distance?: number } = {}
): { destroy: () => void } {
	const { delay = 0, duration = 600, distance = 30 } = params;

	// Check for reduced motion preference
	const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	if (prefersReducedMotion) {
		node.style.opacity = '1';
		node.style.transform = 'none';
		return { destroy: () => {} };
	}

	// Initial state
	node.style.opacity = '0';
	node.style.transform = `translateY(${distance}px)`;
	node.style.transition = `opacity ${duration}ms ease-out ${delay}ms, transform ${duration}ms ease-out ${delay}ms`;

	const observer = createScrollObserver(
		(entry) => {
			if (entry.isIntersecting) {
				node.style.opacity = '1';
				node.style.transform = 'translateY(0)';
			}
		},
		{ threshold: 0.1 }
	);

	observer.observe(node);

	return {
		destroy() {
			observer.disconnect();
		}
	};
}

/**
 * Svelte action for counting up numbers when visible
 * Usage: <span use:countUp={{ value: 40, duration: 2000 }}>0</span>
 */
type CountUpParams = { value: number; duration?: number; suffix?: string; prefix?: string };

export function countUp(
	node: HTMLElement,
	params: CountUpParams
): { destroy: () => void; update: (newParams: CountUpParams) => void } {
	const { value, duration = 2000, suffix = '', prefix = '' } = params;
	let hasAnimated = false;

	const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	if (prefersReducedMotion) {
		node.textContent = `${prefix}${value}${suffix}`;
		return { destroy: () => {}, update: () => {} };
	}

	const animate = () => {
		if (hasAnimated) return;
		hasAnimated = true;

		const startTime = performance.now();
		const startValue = 0;

		const tick = (currentTime: number) => {
			const elapsed = currentTime - startTime;
			const progress = Math.min(elapsed / duration, 1);

			// Easing function (ease-out-cubic)
			const eased = 1 - Math.pow(1 - progress, 3);
			const current = Math.round(startValue + (value - startValue) * eased);

			node.textContent = `${prefix}${current}${suffix}`;

			if (progress < 1) {
				requestAnimationFrame(tick);
			}
		};

		requestAnimationFrame(tick);
	};

	const observer = createScrollObserver(
		(entry) => {
			if (entry.isIntersecting) {
				animate();
			}
		},
		{ threshold: 0.5 }
	);

	observer.observe(node);

	return {
		destroy() {
			observer.disconnect();
		},
		update(newParams: CountUpParams) {
			// Re-animate if value changes
			hasAnimated = false;
			node.textContent = `${newParams.prefix || ''}0${newParams.suffix || ''}`;
		}
	};
}

/**
 * Svelte action for staggered children animations
 * Usage: <div use:staggerChildren={{ stagger: 100 }}>...</div>
 */
export function staggerChildren(
	node: HTMLElement,
	params: { stagger?: number; selector?: string } = {}
): { destroy: () => void } {
	const { stagger = 100, selector = ':scope > *' } = params;

	const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	if (prefersReducedMotion) {
		return { destroy: () => {} };
	}

	const children = node.querySelectorAll(selector);
	children.forEach((child, index) => {
		const el = child as HTMLElement;
		el.style.opacity = '0';
		el.style.transform = 'translateY(20px)';
		el.style.transition = `opacity 500ms ease-out ${index * stagger}ms, transform 500ms ease-out ${index * stagger}ms`;
	});

	const observer = createScrollObserver(
		(entry) => {
			if (entry.isIntersecting) {
				children.forEach((child) => {
					const el = child as HTMLElement;
					el.style.opacity = '1';
					el.style.transform = 'translateY(0)';
				});
			}
		},
		{ threshold: 0.1 }
	);

	observer.observe(node);

	return {
		destroy() {
			observer.disconnect();
		}
	};
}

/**
 * Svelte action for parallax scrolling effect
 * Usage: <div use:parallax={{ speed: 0.5 }}>
 */
export function parallax(
	node: HTMLElement,
	params: { speed?: number } = {}
): { destroy: () => void } {
	const { speed = 0.5 } = params;

	const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	if (prefersReducedMotion) {
		return { destroy: () => {} };
	}

	const handleScroll = () => {
		const rect = node.getBoundingClientRect();
		const scrolled = window.innerHeight - rect.top;
		const offset = scrolled * speed;
		node.style.transform = `translateY(${offset}px)`;
	};

	window.addEventListener('scroll', handleScroll, { passive: true });
	handleScroll();

	return {
		destroy() {
			window.removeEventListener('scroll', handleScroll);
		}
	};
}
