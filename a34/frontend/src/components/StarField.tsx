import { useMemo, useRef, useFrame, useEffect } from 'react';
import * as THREE from 'three';
import { useAppStore } from '../store';
import type { Star } from '../types';

interface StarFieldProps {
  coordinateSystem: 'icrs' | 'galactic' | 'altaz';
}

interface StarPositions {
  icrs: THREE.Vector3;
  galactic: THREE.Vector3;
  altaz: THREE.Vector3;
}

function normalizeAngle(angle: number): number {
  while (angle < 0) angle += 360;
  while (angle >= 360) angle -= 360;
  return angle;
}

function sphericalToCartesian(
  lonDeg: number,
  latDeg: number,
  distance: number = 1
): THREE.Vector3 {
  const lonRad = (lonDeg * Math.PI) / 180;
  const latRad = (latDeg * Math.PI) / 180;
  return new THREE.Vector3(
    distance * Math.cos(latRad) * Math.cos(lonRad),
    distance * Math.sin(latRad),
    distance * Math.cos(latRad) * Math.sin(lonRad)
  );
}

function computeStarPositions(star: Star, starIdx: number): StarPositions {
  const stableDistance = 0.5 + ((starIdx * 0.7919) % 0.4) + (star.magnitude / 50);
  
  const icrsPos = new THREE.Vector3(
    star.x ?? (star.ra !== undefined ? sphericalToCartesian(star.ra, star.dec, stableDistance).x : 0),
    star.y ?? (star.ra !== undefined ? sphericalToCartesian(star.ra, star.dec, stableDistance).y : 0),
    star.z ?? (star.ra !== undefined ? sphericalToCartesian(star.ra, star.dec, stableDistance).z : 0)
  );
  
  let galacticPos: THREE.Vector3;
  if (star.l !== undefined && star.b !== undefined) {
    const lNorm = normalizeAngle(star.l);
    const bClamped = Math.max(-90, Math.min(90, star.b));
    galacticPos = sphericalToCartesian(lNorm, bClamped, stableDistance);
  } else {
    const raNorm = normalizeAngle(star.ra);
    const decClamped = Math.max(-90, Math.min(90, star.dec));
    const lCalc = normalizeAngle(122.93314 - raNorm);
    const bCalc = 27.128336 * (Math.PI / 180);
    const decRad = decClamped * (Math.PI / 180);
    const raRad = raNorm * (Math.PI / 180);
    const galLatRad = Math.asin(
      Math.sin(decRad) * Math.cos(bCalc) - 
      Math.cos(decRad) * Math.sin(raRad) * Math.sin(bCalc)
    );
    galacticPos = sphericalToCartesian(lCalc, galLatRad * (180 / Math.PI), stableDistance);
  }
  
  let altazPos: THREE.Vector3;
  if (star.dec !== undefined && star.ra !== undefined) {
    const raNorm = normalizeAngle(star.ra);
    const decClamped = Math.max(-90, Math.min(90, star.dec));
    const hourAngle = normalizeAngle(180 - raNorm);
    const haRad = hourAngle * (Math.PI / 180);
    const decRad = decClamped * (Math.PI / 180);
    const observerLatRad = 39.907 * (Math.PI / 180);
    
    const altRad = Math.asin(
      Math.sin(decRad) * Math.sin(observerLatRad) +
      Math.cos(decRad) * Math.cos(observerLatRad) * Math.cos(haRad)
    );
    
    const azNum = -Math.cos(decRad) * Math.cos(observerLatRad) * Math.sin(haRad);
    const azDen = Math.sin(decRad) - Math.sin(observerLatRad) * Math.sin(altRad);
    let azRad = Math.atan2(azNum, azDen);
    if (azRad < 0) azRad += 2 * Math.PI;
    
    altazPos = sphericalToCartesian(
      azRad * (180 / Math.PI),
      altRad * (180 / Math.PI),
      stableDistance
    );
  } else {
    altazPos = icrsPos.clone();
  }
  
  return { icrs: icrsPos, galactic: galacticPos, altaz: altazPos };
}

export default function StarField({ coordinateSystem }: StarFieldProps) {
  const { stars, magnitudeRange } = useAppStore();
  const pointsRef = useRef<THREE.Points>(null);
  
  const prevSystemRef = useRef<'icrs' | 'galactic' | 'altaz'>(coordinateSystem);
  const animProgressRef = useRef(1);
  const startPositionsRef = useRef<Float32Array | null>(null);
  const targetPositionsRef = useRef<Float32Array | null>(null);
  const positionAttrRef = useRef<THREE.BufferAttribute | null>(null);
  
  const starPositionsCacheRef = useRef<Map<number, StarPositions>>(new Map());
  
  const getSystemIndex = (sys: string) => {
    switch (sys) {
      case 'icrs': return 0;
      case 'galactic': return 1;
      case 'altaz': return 2;
      default: return 0;
    }
  };
  
  const getPositionFromCache = (star: Star, idx: number, system: 'icrs' | 'galactic' | 'altaz'): THREE.Vector3 => {
    if (!starPositionsCacheRef.current.has(idx)) {
      starPositionsCacheRef.current.set(idx, computeStarPositions(star, idx));
    }
    const cached = starPositionsCacheRef.current.get(idx)!;
    return cached[system];
  };
  
  const { basePositions, colors, sizes, starCount } = useMemo(() => {
    if (!stars.length) {
      return {
        basePositions: new Float32Array(),
        colors: new Float32Array(),
        sizes: new Float32Array(),
        starCount: 0
      };
    }
    
    const filteredStars = stars.filter(
      (s) => s.magnitude >= magnitudeRange[0] && s.magnitude <= magnitudeRange[1]
    );
    
    const positions = new Float32Array(filteredStars.length * 3);
    const colors = new Float32Array(filteredStars.length * 3);
    const sizes = new Float32Array(filteredStars.length);
    
    starPositionsCacheRef.current.clear();
    
    filteredStars.forEach((star: Star, i: number) => {
      const pos = getPositionFromCache(star, i, coordinateSystem);
      positions[i * 3] = pos.x;
      positions[i * 3 + 1] = pos.y;
      positions[i * 3 + 2] = pos.z;
      
      colors[i * 3] = (star.color_r || 255) / 255;
      colors[i * 3 + 1] = (star.color_g || 255) / 255;
      colors[i * 3 + 2] = (star.color_b || 255) / 255;
      
      const brightness = Math.max(0.005, 1.0 - (star.magnitude - 6) / 20);
      sizes[i] = brightness * 8;
    });
    
    return { basePositions: positions, colors, sizes, starCount: filteredStars.length };
  }, [stars, magnitudeRange]);
  
  useEffect(() => {
    if (starCount === 0) return;
    
    if (prevSystemRef.current !== coordinateSystem) {
      const oldSystem = prevSystemRef.current;
      prevSystemRef.current = coordinateSystem;
      
      const filteredStars = stars.filter(
        (s) => s.magnitude >= magnitudeRange[0] && s.magnitude <= magnitudeRange[1]
      );
      
      const startPos = new Float32Array(starCount * 3);
      const targetPos = new Float32Array(starCount * 3);
      
      filteredStars.forEach((star, i) => {
        const startVec = getPositionFromCache(star, i, oldSystem);
        const targetVec = getPositionFromCache(star, i, coordinateSystem);
        
        const dist = startVec.distanceTo(targetVec);
        const directPath = targetVec.clone().sub(startVec);
        
        let adjustedTarget = targetVec;
        if (dist > Math.sqrt(2)) {
          const altPath1 = targetVec.clone().multiplyScalar(-1);
          const altPath2 = new THREE.Vector3(
            targetVec.x > 0 ? -targetVec.x : targetVec.x,
            targetVec.y,
            targetVec.z > 0 ? -targetVec.z : targetVec.z
          );
          
          const dist1 = startVec.distanceTo(altPath1);
          const dist2 = startVec.distanceTo(altPath2);
          
          if (dist1 < dist && dist1 < dist2) {
            adjustedTarget = altPath1;
          } else if (dist2 < dist) {
            adjustedTarget = altPath2;
          }
        }
        
        startPos[i * 3] = startVec.x;
        startPos[i * 3 + 1] = startVec.y;
        startPos[i * 3 + 2] = startVec.z;
        
        targetPos[i * 3] = adjustedTarget.x;
        targetPos[i * 3 + 1] = adjustedTarget.y;
        targetPos[i * 3 + 2] = adjustedTarget.z;
      });
      
      if (positionAttrRef.current) {
        const current = positionAttrRef.current.array as Float32Array;
        startPos.set(current);
      }
      
      startPositionsRef.current = startPos;
      targetPositionsRef.current = targetPos;
      animProgressRef.current = 0;
    }
  }, [coordinateSystem, starCount, stars, magnitudeRange]);
  
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(basePositions, 3);
    positionAttrRef.current = posAttr;
    
    geo.setAttribute('position', posAttr);
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    return geo;
  }, [basePositions, colors, sizes]);
  
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        pixelRatio: { value: window.devicePixelRatio }
      },
      vertexShader: `
        attribute float size;
        attribute vec3 color;
        varying vec3 vColor;
        uniform float pixelRatio;
        
        void main() {
          vColor = color;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * pixelRatio * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        
        void main() {
          vec2 center = gl_PointCoord - vec2(0.5);
          float dist = length(center);
          if (dist > 0.5) discard;
          
          float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
          alpha = pow(alpha, 2.0);
          
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
      transparent: true,
      vertexColors: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
  }, []);
  
  useFrame((state) => {
    if (pointsRef.current) {
      material.uniforms.time.value = state.clock.elapsedTime;
    }
    
    if (positionAttrRef.current && 
        startPositionsRef.current && 
        targetPositionsRef.current &&
        animProgressRef.current < 1) {
      
      animProgressRef.current += 0.025;
      if (animProgressRef.current > 1) animProgressRef.current = 1;
      
      const t = animProgressRef.current;
      const easeT = t < 0.5 
        ? 2 * t * t 
        : 1 - Math.pow(-2 * t + 2, 2) / 2;
      
      const current = positionAttrRef.current.array as Float32Array;
      const start = startPositionsRef.current;
      const target = targetPositionsRef.current;
      
      for (let i = 0; i < current.length; i++) {
        current[i] = start[i] + (target[i] - start[i]) * easeT;
      }
      
      positionAttrRef.current.needsUpdate = true;
    }
  });
  
  if (!stars.length || starCount === 0) return null;
  
  return (
    <points ref={pointsRef} geometry={geometry} material={material}>
      <bufferGeometry attach="geometry" {...geometry} />
      <shaderMaterial attach="material" {...material} />
    </points>
  );
}
