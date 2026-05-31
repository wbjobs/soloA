import { useMemo } from 'react';
import * as THREE from 'three';

interface CoordinateGridProps {
  system: 'icrs' | 'galactic' | 'altaz';
}

export default function CoordinateGrid({ system }: CoordinateGridProps) {
  const gridGroup = useMemo(() => {
    const group = new THREE.Group();
    
    const gridColor = system === 'icrs' ? 0x4466ff : 
                     system === 'galactic' ? 0xff6644 : 0x44ff66;
    const opacity = 0.15;

    const sphereGeo = new THREE.SphereGeometry(0.98, 48, 32);
    const wireframe = new THREE.WireframeGeometry(sphereGeo);
    const line = new THREE.LineSegments(wireframe);
    (line.material as THREE.LineBasicMaterial).color.setHex(gridColor);
    (line.material as THREE.LineBasicMaterial).opacity = opacity * 0.5;
    (line.material as THREE.LineBasicMaterial).transparent = true;
    group.add(line);

    const equatorPoints: THREE.Vector3[] = [];
    for (let i = 0; i <= 128; i++) {
      const angle = (i / 128) * Math.PI * 2;
      equatorPoints.push(new THREE.Vector3(
        Math.cos(angle) * 1.0,
        0,
        Math.sin(angle) * 1.0
      ));
    }
    const equatorGeo = new THREE.BufferGeometry().setFromPoints(equatorPoints);
    const equatorLine = new THREE.Line(
      equatorGeo,
      new THREE.LineBasicMaterial({ color: gridColor, opacity: opacity * 2, transparent: true, linewidth: 2 })
    );
    group.add(equatorLine);

    const primeMeridian: THREE.Vector3[] = [];
    for (let i = 0; i <= 64; i++) {
      const angle = (i / 64) * Math.PI - Math.PI / 2;
      primeMeridian.push(new THREE.Vector3(
        Math.cos(angle) * 1.0,
        Math.sin(angle) * 1.0,
        0
      ));
    }
    const meridianGeo = new THREE.BufferGeometry().setFromPoints(primeMeridian);
    const meridianLine = new THREE.Line(
      meridianGeo,
      new THREE.LineBasicMaterial({ color: gridColor, opacity: opacity * 1.5, transparent: true })
    );
    group.add(meridianLine);

    for (let lat = -60; lat <= 60; lat += 30) {
      if (lat === 0) continue;
      const latRad = (lat * Math.PI) / 180;
      const radius = Math.cos(latRad);
      const y = Math.sin(latRad);
      const points: THREE.Vector3[] = [];
      for (let i = 0; i <= 64; i++) {
        const angle = (i / 64) * Math.PI * 2;
        points.push(new THREE.Vector3(
          Math.cos(angle) * radius,
          y,
          Math.sin(angle) * radius
        ));
      }
      const latGeo = new THREE.BufferGeometry().setFromPoints(points);
      const latLine = new THREE.Line(
        latGeo,
        new THREE.LineBasicMaterial({ color: gridColor, opacity: opacity, transparent: true })
      );
      group.add(latLine);
    }

    return group;
  }, [system]);

  return <primitive object={gridGroup} />;
}
