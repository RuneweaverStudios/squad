<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	// Props for customization
	let {
		nodeCount = 60,
		connectionDistance = 2.5,
		mouseInfluenceRadius = 3,
		rotationSpeed = 0.0003,
		breathingSpeed = 0.0008,
		breathingAmount = 0.05,
		primaryColor = 0x3b82f6, // Electric blue
		secondaryColor = 0x8b5cf6, // Purple/violet
		accentColor = 0x06b6d4, // Teal/cyan
	}: {
		nodeCount?: number;
		connectionDistance?: number;
		mouseInfluenceRadius?: number;
		rotationSpeed?: number;
		breathingSpeed?: number;
		breathingAmount?: number;
		primaryColor?: number;
		secondaryColor?: number;
		accentColor?: number;
	} = $props();

	let container: HTMLDivElement;
	let animationId: number;
	let THREE: typeof import('three');
	let scene: import('three').Scene;
	let camera: import('three').PerspectiveCamera;
	let renderer: import('three').WebGLRenderer;
	let meshGroup: import('three').Group;
	let nodes: import('three').Vector3[] = [];
	let nodePoints: import('three').Points;
	let connectionLines: import('three').LineSegments;
	let glowSphere: import('three').Mesh;

	let mousePos = { x: 0, y: 0 };
	let targetMousePos = { x: 0, y: 0 };
	let time = 0;
	let isVisible = true;
	let prefersReducedMotion = false;

	// Scroll-based complexity
	let scrollProgress = $state(0);
	let connectionMultiplier = $derived(1 + scrollProgress * 0.5);

	onMount(async () => {
		// Dynamically import Three.js (SSR-safe)
		THREE = await import('three');

		// Check for reduced motion preference
		prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

		initScene();
		createGeometricMesh();
		animate();

		// Event listeners
		window.addEventListener('resize', onResize);
		window.addEventListener('mousemove', onMouseMove);
		document.addEventListener('visibilitychange', onVisibilityChange);
		window.addEventListener('scroll', onScroll, { passive: true });

		return () => cleanup();
	});

	onDestroy(() => {
		// Only cleanup in browser
		if (typeof window !== 'undefined') {
			cleanup();
		}
	});

	function cleanup() {
		if (typeof window === 'undefined') return;

		if (animationId) {
			cancelAnimationFrame(animationId);
		}
		window.removeEventListener('resize', onResize);
		window.removeEventListener('mousemove', onMouseMove);
		document.removeEventListener('visibilitychange', onVisibilityChange);
		window.removeEventListener('scroll', onScroll);

		if (renderer) {
			renderer.dispose();
		}
	}

	function initScene() {
		scene = new THREE.Scene();

		// Camera setup
		const aspect = container.clientWidth / container.clientHeight;
		camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
		camera.position.z = 8;

		// Renderer with transparency
		renderer = new THREE.WebGLRenderer({
			antialias: true,
			alpha: true,
			powerPreference: 'high-performance'
		});
		renderer.setSize(container.clientWidth, container.clientHeight);
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap for performance
		renderer.setClearColor(0x000000, 0);
		container.appendChild(renderer.domElement);

		// Group for all mesh elements
		meshGroup = new THREE.Group();
		scene.add(meshGroup);
	}

	function createGeometricMesh() {
		// Generate nodes in a spherical distribution
		nodes = [];
		const positions: number[] = [];
		const colors: number[] = [];
		const sizes: number[] = [];

		for (let i = 0; i < nodeCount; i++) {
			// Fibonacci sphere distribution for even spacing
			const phi = Math.acos(1 - 2 * (i + 0.5) / nodeCount);
			const theta = Math.PI * (1 + Math.sqrt(5)) * i;

			const radius = 3 + Math.random() * 1.5;
			const x = radius * Math.sin(phi) * Math.cos(theta);
			const y = radius * Math.sin(phi) * Math.sin(theta);
			const z = radius * Math.cos(phi);

			nodes.push(new THREE.Vector3(x, y, z));
			positions.push(x, y, z);

			// Color gradient from primary to secondary
			const t = i / nodeCount;
			const color = new THREE.Color();
			color.setHex(t < 0.5 ? primaryColor : secondaryColor);
			colors.push(color.r, color.g, color.b);

			// Varying sizes for depth perception
			sizes.push(0.04 + Math.random() * 0.03);
		}

		// Create points geometry for nodes
		const pointsGeometry = new THREE.BufferGeometry();
		pointsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
		pointsGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
		pointsGeometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));

		// Custom shader for glowing points
		const pointsMaterial = new THREE.ShaderMaterial({
			uniforms: {
				uTime: { value: 0 },
				uPixelRatio: { value: renderer.getPixelRatio() }
			},
			vertexShader: `
				attribute float size;
				attribute vec3 color;
				varying vec3 vColor;
				uniform float uTime;
				uniform float uPixelRatio;

				void main() {
					vColor = color;
					vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
					float pulse = 1.0 + 0.2 * sin(uTime * 2.0 + position.x * 3.0);
					gl_PointSize = size * uPixelRatio * 100.0 * pulse / -mvPosition.z;
					gl_Position = projectionMatrix * mvPosition;
				}
			`,
			fragmentShader: `
				varying vec3 vColor;

				void main() {
					float dist = length(gl_PointCoord - vec2(0.5));
					if (dist > 0.5) discard;

					float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
					float glow = exp(-dist * 4.0);

					vec3 finalColor = vColor + glow * 0.5;
					gl_FragColor = vec4(finalColor, alpha * 0.9);
				}
			`,
			transparent: true,
			depthWrite: false,
			blending: THREE.AdditiveBlending
		});

		nodePoints = new THREE.Points(pointsGeometry, pointsMaterial);
		meshGroup.add(nodePoints);

		// Create connection lines
		updateConnections();

		// Central glow sphere
		const glowGeometry = new THREE.SphereGeometry(1.5, 32, 32);
		const glowMaterial = new THREE.ShaderMaterial({
			uniforms: {
				uTime: { value: 0 },
				uColor1: { value: new THREE.Color(primaryColor) },
				uColor2: { value: new THREE.Color(accentColor) }
			},
			vertexShader: `
				varying vec3 vNormal;
				varying vec3 vPosition;

				void main() {
					vNormal = normalize(normalMatrix * normal);
					vPosition = position;
					gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
				}
			`,
			fragmentShader: `
				uniform float uTime;
				uniform vec3 uColor1;
				uniform vec3 uColor2;
				varying vec3 vNormal;
				varying vec3 vPosition;

				void main() {
					float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 3.0);
					float pulse = 0.5 + 0.5 * sin(uTime * 1.5);
					vec3 color = mix(uColor1, uColor2, pulse);
					gl_FragColor = vec4(color, fresnel * 0.15);
				}
			`,
			transparent: true,
			depthWrite: false,
			side: THREE.BackSide,
			blending: THREE.AdditiveBlending
		});

		glowSphere = new THREE.Mesh(glowGeometry, glowMaterial);
		meshGroup.add(glowSphere);
	}

	function updateConnections() {
		// Remove existing lines
		if (connectionLines) {
			meshGroup.remove(connectionLines);
			connectionLines.geometry.dispose();
			(connectionLines.material as THREE.Material).dispose();
		}

		const linePositions: number[] = [];
		const lineColors: number[] = [];
		const effectiveDistance = connectionDistance * connectionMultiplier;

		// Find connections between nearby nodes
		for (let i = 0; i < nodes.length; i++) {
			for (let j = i + 1; j < nodes.length; j++) {
				const dist = nodes[i].distanceTo(nodes[j]);
				if (dist < effectiveDistance) {
					linePositions.push(
						nodes[i].x, nodes[i].y, nodes[i].z,
						nodes[j].x, nodes[j].y, nodes[j].z
					);

					// Color based on distance (closer = brighter)
					const intensity = 1 - dist / effectiveDistance;
					const color = new THREE.Color(primaryColor);
					lineColors.push(
						color.r * intensity, color.g * intensity, color.b * intensity,
						color.r * intensity, color.g * intensity, color.b * intensity
					);
				}
			}
		}

		const lineGeometry = new THREE.BufferGeometry();
		lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
		lineGeometry.setAttribute('color', new THREE.Float32BufferAttribute(lineColors, 3));

		const lineMaterial = new THREE.LineBasicMaterial({
			vertexColors: true,
			transparent: true,
			opacity: 0.4,
			blending: THREE.AdditiveBlending
		});

		connectionLines = new THREE.LineSegments(lineGeometry, lineMaterial);
		meshGroup.add(connectionLines);
	}

	function animate() {
		if (!isVisible || prefersReducedMotion) {
			animationId = requestAnimationFrame(animate);
			return;
		}

		time += 0.016; // ~60fps timestep

		// Smooth mouse interpolation
		mousePos.x += (targetMousePos.x - mousePos.x) * 0.05;
		mousePos.y += (targetMousePos.y - mousePos.y) * 0.05;

		// Rotate the mesh group
		meshGroup.rotation.y += rotationSpeed;
		meshGroup.rotation.x = mousePos.y * 0.3;
		meshGroup.rotation.z = mousePos.x * 0.1;

		// Breathing effect (scale pulse)
		const breathe = 1 + Math.sin(time * breathingSpeed * 1000) * breathingAmount;
		meshGroup.scale.setScalar(breathe);

		// Mouse attraction on nodes
		const raycaster = new THREE.Raycaster();
		const mouseVector = new THREE.Vector2(mousePos.x, mousePos.y);
		raycaster.setFromCamera(mouseVector, camera);

		const positions = nodePoints.geometry.attributes.position.array as Float32Array;
		for (let i = 0; i < nodes.length; i++) {
			const node = nodes[i];
			const idx = i * 3;

			// Calculate distance from mouse ray
			const point = new THREE.Vector3(positions[idx], positions[idx + 1], positions[idx + 2]);
			point.applyMatrix4(meshGroup.matrixWorld);

			const closestPoint = new THREE.Vector3();
			raycaster.ray.closestPointToPoint(point, closestPoint);
			const distToRay = point.distanceTo(closestPoint);

			if (distToRay < mouseInfluenceRadius) {
				// Attract towards mouse
				const influence = (1 - distToRay / mouseInfluenceRadius) * 0.02;
				const direction = closestPoint.sub(point).normalize();

				positions[idx] += direction.x * influence;
				positions[idx + 1] += direction.y * influence;
				positions[idx + 2] += direction.z * influence;
			} else {
				// Slowly return to original position
				positions[idx] += (node.x - positions[idx]) * 0.01;
				positions[idx + 1] += (node.y - positions[idx + 1]) * 0.01;
				positions[idx + 2] += (node.z - positions[idx + 2]) * 0.01;
			}
		}
		nodePoints.geometry.attributes.position.needsUpdate = true;

		// Update uniforms
		const pointsMaterial = nodePoints.material as THREE.ShaderMaterial;
		pointsMaterial.uniforms.uTime.value = time;

		const glowMaterial = glowSphere.material as THREE.ShaderMaterial;
		glowMaterial.uniforms.uTime.value = time;

		// Update connections periodically (expensive operation)
		if (Math.floor(time * 10) % 20 === 0) {
			updateConnections();
		}

		renderer.render(scene, camera);
		animationId = requestAnimationFrame(animate);
	}

	function onResize() {
		if (!container || !camera || !renderer) return;

		const width = container.clientWidth;
		const height = container.clientHeight;

		camera.aspect = width / height;
		camera.updateProjectionMatrix();
		renderer.setSize(width, height);
	}

	function onMouseMove(event: MouseEvent) {
		// Normalize to -1 to 1
		targetMousePos.x = (event.clientX / window.innerWidth) * 2 - 1;
		targetMousePos.y = -(event.clientY / window.innerHeight) * 2 + 1;
	}

	function onVisibilityChange() {
		isVisible = !document.hidden;
	}

	function onScroll() {
		const hero = document.querySelector('.hero-section');
		if (hero) {
			const rect = hero.getBoundingClientRect();
			const viewportHeight = window.innerHeight;
			scrollProgress = Math.max(0, Math.min(1, 1 - (rect.bottom / viewportHeight)));
		}
	}
</script>

<div bind:this={container} class="absolute inset-0 z-0">
	<!-- Canvas will be inserted here by Three.js -->
</div>

<style>
	div {
		pointer-events: none;
	}

	div :global(canvas) {
		display: block;
	}
</style>
