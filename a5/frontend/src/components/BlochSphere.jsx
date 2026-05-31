import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

function BlochSphere({ coordinates, qubitIndex }) {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const stateVectorRef = useRef(null);
  const animationIdRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(2.5, 2.5, 2.5);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    const sphereGeometry = new THREE.SphereGeometry(1, 32, 32);
    const sphereMaterial = new THREE.MeshPhongMaterial({
      color: 0x7b2cbf,
      transparent: true,
      opacity: 0.2,
      wireframe: true,
    });
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    scene.add(sphere);

    const solidSphereGeometry = new THREE.SphereGeometry(1, 32, 32);
    const solidSphereMaterial = new THREE.MeshPhongMaterial({
      color: 0x7b2cbf,
      transparent: true,
      opacity: 0.1,
    });
    const solidSphere = new THREE.Mesh(solidSphereGeometry, solidSphereMaterial);
    scene.add(solidSphere);

    const axisMaterial = new THREE.LineBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.5 });
    
    const xAxisGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-1.2, 0, 0),
      new THREE.Vector3(1.2, 0, 0)
    ]);
    const xAxis = new THREE.Line(xAxisGeometry, axisMaterial);
    scene.add(xAxis);

    const yAxisGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -1.2, 0),
      new THREE.Vector3(0, 1.2, 0)
    ]);
    const yAxis = new THREE.Line(yAxisGeometry, axisMaterial);
    scene.add(yAxis);

    const zAxisGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, -1.2),
      new THREE.Vector3(0, 0, 1.2)
    ]);
    const zAxis = new THREE.Line(zAxisGeometry, axisMaterial);
    scene.add(zAxis);

    const createLabel = (text, position) => {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.width = 64;
      canvas.height = 32;
      
      context.fillStyle = '#ffffff';
      context.font = 'bold 16px Arial';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(text, 32, 16);
      
      const texture = new THREE.CanvasTexture(canvas);
      const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
      const sprite = new THREE.Sprite(material);
      sprite.position.copy(position);
      sprite.scale.set(0.3, 0.15, 1);
      scene.add(sprite);
    };

    createLabel('|0⟩', new THREE.Vector3(0, 1.3, 0));
    createLabel('|1⟩', new THREE.Vector3(0, -1.3, 0));
    createLabel('X', new THREE.Vector3(1.3, 0, 0));
    createLabel('Y', new THREE.Vector3(0, 0, -1.3));
    createLabel('Z', new THREE.Vector3(0, 0, 1.3));

    const arrowGeometry = new THREE.ConeGeometry(0.05, 0.15, 16);
    const arrowMaterial = new THREE.MeshPhongMaterial({ color: 0xff4757 });
    const arrow = new THREE.Mesh(arrowGeometry, arrowMaterial);
    
    const cylinderGeometry = new THREE.CylinderGeometry(0.02, 0.02, 1, 16);
    const cylinderMaterial = new THREE.MeshPhongMaterial({ color: 0xff4757 });
    const cylinder = new THREE.Mesh(cylinderGeometry, cylinderMaterial);

    const stateVector = new THREE.Group();
    stateVector.add(cylinder);
    stateVector.add(arrow);
    
    if (coordinates) {
      const { x, y, z } = coordinates;
      const length = Math.sqrt(x * x + y * y + z * z);
      const targetLength = Math.min(length, 1);
      
      cylinder.scale.y = targetLength;
      cylinder.position.y = targetLength / 2;
      arrow.position.y = targetLength;
      
      const phi = Math.atan2(-z, x);
      const theta = Math.acos(y / (targetLength || 1));
      
      stateVector.rotation.z = phi;
      stateVector.rotation.x = theta - Math.PI / 2;
    }
    
    scene.add(stateVector);
    stateVectorRef.current = stateVector;

    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };
    let rotationY = 0;
    let rotationX = 0.3;

    const onMouseDown = (e) => {
      isDragging = true;
      previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;
      
      const deltaX = e.clientX - previousMousePosition.x;
      const deltaY = e.clientY - previousMousePosition.y;
      
      rotationY += deltaX * 0.01;
      rotationX += deltaY * 0.01;
      rotationX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotationX));
      
      camera.position.x = 2.5 * Math.cos(rotationX) * Math.sin(rotationY);
      camera.position.y = 2.5 * Math.sin(rotationX);
      camera.position.z = 2.5 * Math.cos(rotationX) * Math.cos(rotationY);
      camera.lookAt(0, 0, 0);
      
      previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    const onMouseUp = () => {
      isDragging = false;
    };

    renderer.domElement.addEventListener('mousedown', onMouseDown);
    renderer.domElement.addEventListener('mousemove', onMouseMove);
    renderer.domElement.addEventListener('mouseup', onMouseUp);
    renderer.domElement.addEventListener('mouseleave', onMouseUp);

    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);
      
      if (!isDragging) {
        rotationY += 0.003;
        camera.position.x = 2.5 * Math.cos(rotationX) * Math.sin(rotationY);
        camera.position.z = 2.5 * Math.cos(rotationX) * Math.cos(rotationY);
        camera.lookAt(0, 0, 0);
      }
      
      renderer.render(scene, camera);
    };
    
    animate();

    const handleResize = () => {
      if (!containerRef.current) return;
      const newWidth = containerRef.current.clientWidth;
      const newHeight = containerRef.current.clientHeight;
      
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('mousedown', onMouseDown);
      renderer.domElement.removeEventListener('mousemove', onMouseMove);
      renderer.domElement.removeEventListener('mouseup', onMouseUp);
      renderer.domElement.removeEventListener('mouseleave', onMouseUp);
      
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
      
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  useEffect(() => {
    if (!stateVectorRef.current || !coordinates) return;

    const { x, y, z } = coordinates;
    const stateVector = stateVectorRef.current;
    const cylinder = stateVector.children[0];
    const arrow = stateVector.children[1];
    
    const length = Math.sqrt(x * x + y * y + z * z);
    const targetLength = Math.min(length, 1);
    
    cylinder.scale.y = targetLength;
    cylinder.position.y = targetLength / 2;
    arrow.position.y = targetLength;
    
    if (targetLength > 0.01) {
      const phi = Math.atan2(-z, x);
      const theta = Math.acos(y / targetLength);
      
      stateVector.rotation.z = phi;
      stateVector.rotation.x = theta - Math.PI / 2;
    }
  }, [coordinates]);

  return (
    <div style={{ position: 'relative' }}>
      <div className="bloch-label">
        Qubit {qubitIndex}
      </div>
      <div 
        ref={containerRef} 
        style={{ width: '100%', height: '280px', cursor: 'grab' }}
      />
    </div>
  );
}

export default BlochSphere;
