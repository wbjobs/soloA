import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Card, Tag, Space, Statistic, Button, Typography, Row, Col } from 'antd';
import { WarningOutlined, ThunderboltOutlined, CheckCircleOutlined } from '@ant-design/icons';

const { Title } = Typography;

const DigitalTwin = ({ realtimeData }) => {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const animationIdRef = useRef(null);
  const modelsRef = useRef({});
  const particlesRef = useRef({});
  const timeRef = useRef(0);

  const [isInitialized, setIsInitialized] = useState(false);
  const [deviceStatus, setDeviceStatus] = useState({
    pump: { running: true, rpm: 1500 },
    tank: { level: 75, temp: 45 },
    pipe: { pressure: 4.5, flow: 450 }
  });
  const [showParticles, setShowParticles] = useState(true);
  const [autoRotate, setAutoRotate] = useState(true);

  const initScene = useCallback(() => {
    if (!containerRef.current || isInitialized) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    scene.fog = new THREE.FogExp2(0x1a1a2e, 0.02);

    const camera = new THREE.PerspectiveCamera(
      60,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.set(15, 12, 15);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true
    });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    containerRef.current.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 0.5;
    controls.maxPolarAngle = Math.PI / 2;
    controls.minDistance = 5;
    controls.maxDistance = 50;

    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 1);
    mainLight.position.set(10, 20, 10);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 2048;
    mainLight.shadow.mapSize.height = 2048;
    mainLight.shadow.camera.near = 0.5;
    mainLight.shadow.camera.far = 50;
    mainLight.shadow.camera.left = -20;
    mainLight.shadow.camera.right = 20;
    mainLight.shadow.camera.top = 20;
    mainLight.shadow.camera.bottom = -20;
    scene.add(mainLight);

    const pointLight1 = new THREE.PointLight(0x00aaff, 0.8, 50);
    pointLight1.position.set(-10, 10, 0);
    scene.add(pointLight1);

    const pointLight2 = new THREE.PointLight(0xff6600, 0.5, 50);
    pointLight2.position.set(10, 5, -10);
    scene.add(pointLight2);

    const groundGeometry = new THREE.PlaneGeometry(100, 100);
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x2a2a3e,
      roughness: 0.8,
      metalness: 0.2
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const gridHelper = new THREE.GridHelper(100, 50, 0x444466, 0x333355);
    gridHelper.position.y = 0.01;
    scene.add(gridHelper);

    const factoryGroup = new THREE.Group();
    factoryGroup.name = 'factory';

    const tank = createTank();
    tank.position.set(0, 0, 0);
    factoryGroup.add(tank);
    modelsRef.current.tank = tank;

    const pump = createPump();
    pump.position.set(-8, 0, 0);
    factoryGroup.add(pump);
    modelsRef.current.pump = pump;

    const pipe = createPipeSystem();
    pipe.position.set(0, 0, 0);
    factoryGroup.add(pipe);
    modelsRef.current.pipe = pipe;

    const valves = createValves();
    factoryGroup.add(valves);
    modelsRef.current.valves = valves;

    const motor = createMotor();
    motor.position.set(8, 0, 5);
    factoryGroup.add(motor);
    modelsRef.current.motor = motor;

    createParticles(scene);

    scene.add(factoryGroup);

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    controlsRef.current = controls;

    setIsInitialized(true);

    const handleResize = () => {
      if (!containerRef.current) return;
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [isInitialized, autoRotate]);

  const createTank = () => {
    const group = new THREE.Group();
    group.name = 'tank';

    const tankBody = new THREE.CylinderGeometry(3, 3, 8, 32);
    const tankMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a90d9,
      roughness: 0.4,
      metalness: 0.6,
      transparent: true,
      opacity: 0.9
    });
    const tankMesh = new THREE.Mesh(tankBody, tankMaterial);
    tankMesh.position.y = 4;
    tankMesh.castShadow = true;
    tankMesh.receiveShadow = true;
    group.add(tankMesh);

    const topRing = new THREE.TorusGeometry(3, 0.15, 16, 64);
    const ringMaterial = new THREE.MeshStandardMaterial({
      color: 0x666666,
      roughness: 0.3,
      metalness: 0.8
    });
    const topRingMesh = new THREE.Mesh(topRing, ringMaterial);
    topRingMesh.position.y = 8;
    topRingMesh.rotation.x = Math.PI / 2;
    topRingMesh.castShadow = true;
    group.add(topRingMesh);

    const liquidGeometry = new THREE.CylinderGeometry(2.8, 2.8, 7.5, 32);
    const liquidMaterial = new THREE.MeshStandardMaterial({
      color: 0x00ff88,
      roughness: 0.1,
      metalness: 0.3,
      transparent: true,
      opacity: 0.6,
      emissive: 0x003322,
      emissiveIntensity: 0.2
    });
    const liquid = new THREE.Mesh(liquidGeometry, liquidMaterial);
    liquid.position.y = 0.5;
    liquid.scale.y = 0.9;
    liquid.name = 'liquid';
    group.add(liquid);

    const levelMarkers = new THREE.Group();
    for (let i = 0; i <= 4; i++) {
      const marker = new THREE.BoxGeometry(0.8, 0.1, 0.1);
      const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
      const markerMesh = new THREE.Mesh(marker, markerMaterial);
      markerMesh.position.set(3.2, 1 + i * 1.8, 0);
      levelMarkers.add(markerMesh);
    }
    group.add(levelMarkers);

    const indicatorLight = new THREE.SphereGeometry(0.2, 16, 16);
    const indicatorMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      emissive: 0x00ff00,
      emissiveIntensity: 1
    });
    const indicator = new THREE.Mesh(indicatorLight, indicatorMaterial);
    indicator.position.set(0, 8.5, 2.5);
    indicator.name = 'indicator';
    group.add(indicator);

    return group;
  };

  const createPump = () => {
    const group = new THREE.Group();
    group.name = 'pump';

    const base = new THREE.BoxGeometry(4, 1, 3);
    const baseMaterial = new THREE.MeshStandardMaterial({
      color: 0x555555,
      roughness: 0.7,
      metalness: 0.3
    });
    const baseMesh = new THREE.Mesh(base, baseMaterial);
    baseMesh.position.y = 0.5;
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    group.add(baseMesh);

    const motorBody = new THREE.CylinderGeometry(1.2, 1.2, 2, 24);
    const motorMaterial = new THREE.MeshStandardMaterial({
      color: 0x3366cc,
      roughness: 0.5,
      metalness: 0.5
    });
    const motorMesh = new THREE.Mesh(motorBody, motorMaterial);
    motorMesh.position.y = 2.5;
    motorMesh.castShadow = true;
    group.add(motorMesh);

    const fanGeometry = new THREE.BoxGeometry(0.1, 2, 0.4);
    const fanMaterial = new THREE.MeshStandardMaterial({
      color: 0xffaa00,
      roughness: 0.3,
      metalness: 0.7,
      emissive: 0x331100,
      emissiveIntensity: 0.3
    });

    const fanGroup = new THREE.Group();
    fanGroup.name = 'fan';
    
    for (let i = 0; i < 6; i++) {
      const fan = new THREE.Mesh(fanGeometry, fanMaterial);
      fan.rotation.y = (i * Math.PI) / 3;
      fanGroup.add(fan);
    }
    
    fanGroup.position.y = 3.8;
    group.add(fanGroup);
    modelsRef.current.fan = fanGroup;

    const impellerGeometry = new THREE.TorusGeometry(1, 0.2, 16, 32);
    const impellerMaterial = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      roughness: 0.2,
      metalness: 0.9
    });
    const impeller = new THREE.Mesh(impellerGeometry, impellerMaterial);
    impeller.position.set(-3, 2.5, 0);
    impeller.rotation.y = Math.PI / 2;
    impeller.name = 'impeller';
    group.add(impeller);

    const vibrationIndicator = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 16, 16),
      new THREE.MeshBasicMaterial({
        color: 0x00ff00,
        emissive: 0x00ff00
      })
    );
    vibrationIndicator.position.set(0, 3.8, 0);
    vibrationIndicator.name = 'vibrationIndicator';
    group.add(vibrationIndicator);

    return group;
  };

  const createPipeSystem = () => {
    const group = new THREE.Group();
    group.name = 'pipes';

    const pipeMaterial = new THREE.MeshStandardMaterial({
      color: 0x888888,
      roughness: 0.4,
      metalness: 0.7
    });

    const pipe1 = new THREE.CylinderGeometry(0.3, 0.3, 8, 16);
    const pipeMesh1 = new THREE.Mesh(pipe1, pipeMaterial);
    pipeMesh1.rotation.z = Math.PI / 2;
    pipeMesh1.position.set(-4, 2, 0);
    pipeMesh1.castShadow = true;
    group.add(pipeMesh1);

    const pipe2 = new THREE.CylinderGeometry(0.3, 0.3, 5, 16);
    const pipeMesh2 = new THREE.Mesh(pipe2, pipeMaterial);
    pipeMesh2.position.set(3, 4.5, 0);
    pipeMesh2.castShadow = true;
    group.add(pipeMesh2);

    const pipe3 = new THREE.CylinderGeometry(0.3, 0.3, 6, 16);
    const pipeMesh3 = new THREE.Mesh(pipe3, pipeMaterial);
    pipeMesh3.rotation.z = Math.PI / 2;
    pipeMesh3.position.set(6, 2, 0);
    pipeMesh3.castShadow = true;
    group.add(pipeMesh3);

    const flowIndicator = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 16, 16),
      new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        emissive: 0x00ffff,
        transparent: true,
        opacity: 0.8
      })
    );
    flowIndicator.position.set(0, 2, 0);
    flowIndicator.name = 'flowIndicator';
    group.add(flowIndicator);

    return group;
  };

  const createValves = () => {
    const group = new THREE.Group();
    group.name = 'valves';

    const valveMaterial = new THREE.MeshStandardMaterial({
      color: 0xdd6600,
      roughness: 0.5,
      metalness: 0.6
    });

    const valve1 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.4, 0.8, 16),
      valveMaterial
    );
    valve1.position.set(-2, 2, 0);
    valve1.castShadow = true;
    valve1.name = 'valve1';
    group.add(valve1);

    const handle1 = new THREE.Mesh(
      new THREE.BoxGeometry(1, 0.1, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x444444 })
    );
    handle1.position.set(-2, 2.5, 0);
    handle1.name = 'handle1';
    group.add(handle1);

    const valve2 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.4, 0.8, 16),
      valveMaterial
    );
    valve2.position.set(3, 2, 0);
    valve2.castShadow = true;
    valve2.name = 'valve2';
    group.add(valve2);

    return group;
  };

  const createMotor = () => {
    const group = new THREE.Group();
    group.name = 'motor';

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(3, 2, 2),
      new THREE.MeshStandardMaterial({
        color: 0x444444,
        roughness: 0.6,
        metalness: 0.5
      })
    );
    body.position.y = 1;
    body.castShadow = true;
    group.add(body);

    const rotationPart = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.4, 1.5, 24),
      new THREE.MeshStandardMaterial({
        color: 0x00aaff,
        roughness: 0.3,
        metalness: 0.7,
        emissive: 0x001122,
        emissiveIntensity: 0.5
      })
    );
    rotationPart.rotation.x = Math.PI / 2;
    rotationPart.position.set(0, 1.5, 1.8);
    rotationPart.name = 'rotationPart';
    group.add(rotationPart);

    return group;
  };

  const createParticles = (scene) => {
    const particleCount = 500;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      positions[i3] = (Math.random() - 0.5) * 30;
      positions[i3 + 1] = Math.random() * 15;
      positions[i3 + 2] = (Math.random() - 0.5) * 30;

      colors[i3] = 0.2 + Math.random() * 0.3;
      colors[i3 + 1] = 0.5 + Math.random() * 0.3;
      colors[i3 + 2] = 1.0;
    }

    const ambientGeometry = new THREE.BufferGeometry();
    ambientGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    ambientGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const ambientMaterial = new THREE.PointsMaterial({
      size: 0.1,
      vertexColors: true,
      transparent: true,
      opacity: 0.6
    });

    const ambientParticles = new THREE.Points(ambientGeometry, ambientMaterial);
    ambientParticles.name = 'ambientParticles';
    scene.add(ambientParticles);
    particlesRef.current.ambient = ambientParticles;

    const warningGeometry = new THREE.BufferGeometry();
    const warningPositions = new Float32Array(200 * 3);
    const warningColors = new Float32Array(200 * 3);

    for (let i = 0; i < 200; i++) {
      const i3 = i * 3;
      warningPositions[i3] = (Math.random() - 0.5) * 6;
      warningPositions[i3 + 1] = Math.random() * 8;
      warningPositions[i3 + 2] = (Math.random() - 0.5) * 6;

      warningColors[i3] = 1.0;
      warningColors[i3 + 1] = 0.2 + Math.random() * 0.2;
      warningColors[i3 + 2] = 0;
    }

    warningGeometry.setAttribute('position', new THREE.BufferAttribute(warningPositions, 3));
    warningGeometry.setAttribute('color', new THREE.BufferAttribute(warningColors, 3));

    const warningMaterial = new THREE.PointsMaterial({
      size: 0.15,
      vertexColors: true,
      transparent: true,
      opacity: 0
    });

    const warningParticles = new THREE.Points(warningGeometry, warningMaterial);
    warningParticles.name = 'warningParticles';
    warningParticles.visible = false;
    scene.add(warningParticles);
    particlesRef.current.warning = warningParticles;
  };

  const animate = () => {
    animationIdRef.current = requestAnimationFrame(animate);
    timeRef.current += 0.016;

    if (controlsRef.current) {
      controlsRef.current.update();
    }

    updateModelAnimations();
    updateParticleEffects();

    if (rendererRef.current && sceneRef.current && cameraRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    }
  };

  const updateModelAnimations = () => {
    const { fan, tank, motor } = modelsRef.current;
    if (!fan || !tank) return;

    const temp = realtimeData['tag-temp']?.value || deviceStatus.tank.temp;
    const pressure = realtimeData['tag-pressure']?.value || deviceStatus.pipe.pressure;
    const flow = realtimeData['tag-flow']?.value || deviceStatus.pipe.flow;

    const fanSpeed = (flow / 400) * 0.2;
    if (fan) {
      fan.rotation.y += fanSpeed;
    }

    if (motor?.children) {
      const rotationPart = motor.getObjectByName('rotationPart');
      if (rotationPart) {
        rotationPart.rotation.z += fanSpeed * 2;
      }
    }

    if (tank) {
      const liquid = tank.getObjectByName('liquid');
      if (liquid) {
        const targetScale = (temp / 100) * 0.9;
        liquid.scale.y = liquid.scale.y + (targetScale - liquid.scale.y) * 0.05;
      }

      const indicator = tank.getObjectByName('indicator');
      if (indicator) {
        if (temp > 80 || pressure > 8) {
          indicator.material.color.setHex(0xff0000);
          indicator.material.emissive.setHex(0xff0000);
          indicator.material.emissiveIntensity = 0.5 + Math.sin(timeRef.current * 5) * 0.5;
        } else if (temp > 60 || pressure > 5) {
          indicator.material.color.setHex(0xffff00);
          indicator.material.emissive.setHex(0xffff00);
          indicator.material.emissiveIntensity = 0.3;
        } else {
          indicator.material.color.setHex(0x00ff00);
          indicator.material.emissive.setHex(0x00ff00);
          indicator.material.emissiveIntensity = 0.2;
        }
      }
    }

    const vibrationIndicator = fan?.parent?.getObjectByName('vibrationIndicator');
    if (vibrationIndicator) {
      const vibration = (pressure / 10) * 0.1;
      vibrationIndicator.position.x = Math.sin(timeRef.current * 20) * vibration;
      vibrationIndicator.position.z = Math.cos(timeRef.current * 20) * vibration;
    }

    const impeller = fan?.parent?.getObjectByName('impeller');
    if (impeller) {
      impeller.rotation.z += fanSpeed * 3;
    }
  };

  const updateParticleEffects = () => {
    if (!showParticles) return;

    const temp = realtimeData['tag-temp']?.value || deviceStatus.tank.temp;
    const pressure = realtimeData['tag-pressure']?.value || deviceStatus.pipe.pressure;
    const isWarning = temp > 60 || pressure > 5;
    const isCritical = temp > 80 || pressure > 8;

    if (particlesRef.current.ambient) {
      const positions = particlesRef.current.ambient.geometry.attributes.position.array;
      for (let i = 0; i < positions.length; i += 3) {
        positions[i + 1] += 0.02;
        if (positions[i + 1] > 15) {
          positions[i + 1] = 0;
        }
      }
      particlesRef.current.ambient.geometry.attributes.position.needsUpdate = true;
    }

    if (particlesRef.current.warning) {
      if (isWarning || isCritical) {
        particlesRef.current.warning.visible = true;
        particlesRef.current.warning.material.opacity = isCritical ? 0.9 : 0.5;

        const positions = particlesRef.current.warning.geometry.attributes.position.array;
        const colors = particlesRef.current.warning.geometry.attributes.color.array;

        for (let i = 0; i < positions.length; i += 3) {
          positions[i + 1] += isCritical ? 0.1 : 0.05;
          if (positions[i + 1] > 10) {
            positions[i + 1] = 0;
            positions[i] = (Math.random() - 0.5) * 6;
            positions[i + 2] = (Math.random() - 0.5) * 6;
          }

          colors[i] = isCritical ? 1.0 : 1.0;
          colors[i + 1] = isCritical ? 0 : 0.5;
          colors[i + 2] = 0;
        }

        particlesRef.current.warning.geometry.attributes.position.needsUpdate = true;
        particlesRef.current.warning.geometry.attributes.color.needsUpdate = true;
      } else {
        particlesRef.current.warning.visible = false;
      }
    }
  };

  useEffect(() => {
    initScene();

    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
      if (rendererRef.current) {
        rendererRef.current.dispose();
        if (containerRef.current && rendererRef.current.domElement) {
          containerRef.current.removeChild(rendererRef.current.domElement);
        }
      }
      if (sceneRef.current) {
        sceneRef.current.traverse((object) => {
          if (object.geometry) object.geometry.dispose();
          if (object.material) {
            if (Array.isArray(object.material)) {
              object.material.forEach(m => m.dispose());
            } else {
              object.material.dispose();
            }
          }
        });
      }
    };
  }, [initScene]);

  useEffect(() => {
    if (!isInitialized) return;

    const temp = realtimeData['tag-temp']?.value;
    const pressure = realtimeData['tag-pressure']?.value;
    const flow = realtimeData['tag-flow']?.value;

    if (temp !== undefined) {
      setDeviceStatus(prev => ({
        ...prev,
        tank: { ...prev.tank, temp }
      }));
    }
    if (pressure !== undefined) {
      setDeviceStatus(prev => ({
        ...prev,
        pipe: { ...prev.pipe, pressure }
      }));
    }
    if (flow !== undefined) {
      setDeviceStatus(prev => ({
        ...prev,
        pipe: { ...prev.pipe, flow },
        pump: { ...prev.pump, rpm: flow * 3 }
      }));
    }
  }, [realtimeData, isInitialized]);

  const temp = realtimeData['tag-temp']?.value || '--';
  const pressure = realtimeData['tag-pressure']?.value || '--';
  const flow = realtimeData['tag-flow']?.value || '--';
  const isWarning = (temp !== '--' && temp > 60) || (pressure !== '--' && pressure > 5);
  const isCritical = (temp !== '--' && temp > 80) || (pressure !== '--' && pressure > 8);

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="水箱温度"
              value={temp}
              precision={1}
              suffix="°C"
              valueStyle={{ color: isCritical ? '#ff4d4f' : isWarning ? '#faad14' : '#52c41a' }}
              prefix={isCritical ? <WarningOutlined /> : <CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="管道压力"
              value={pressure}
              precision={1}
              suffix="MPa"
              valueStyle={{ color: isCritical ? '#ff4d4f' : isWarning ? '#faad14' : '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="流量"
              value={flow}
              precision={0}
              suffix="m³/h"
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="泵转速"
              value={deviceStatus.pump.rpm}
              precision={0}
              suffix="RPM"
              valueStyle={{ color: isWarning ? '#faad14' : '#1890ff' }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col span={18}>
          <Card
            title={
              <Space>
                <ThunderboltOutlined style={{ color: isCritical ? '#ff4d4f' : '#1890ff' }} />
                设备数字孪生 3D 预览
                {isCritical && <Tag color="red">⚠️ 临界状态</Tag>}
                {isWarning && !isCritical && <Tag color="orange">⚠️ 警告状态</Tag>}
                {!isWarning && <Tag color="green">正常运行</Tag>}
              </Space>
            }
            extra={
              <Space>
                <Button
                  onClick={() => setAutoRotate(!autoRotate)}
                  type={autoRotate ? 'primary' : 'default'}
                  size="small"
                >
                  自动旋转: {autoRotate ? '开' : '关'}
                </Button>
                <Button
                  onClick={() => setShowParticles(!showParticles)}
                  type={showParticles ? 'primary' : 'default'}
                  size="small"
                >
                  粒子效果: {showParticles ? '开' : '关'}
                </Button>
              </Space>
            }
          >
            <div
              ref={containerRef}
              style={{
                width: '100%',
                height: 500,
                background: 'linear-gradient(180deg, #0f0f23 0%, #1a1a2e 100%)',
                borderRadius: 8
              }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Space direction="vertical" size={[16, 16]} style={{ width: '100%' }}>
            <Card title="设备说明" size="small">
              <div style={{ fontSize: 12, color: '#666' }}>
                <p>🔵 <strong>水箱</strong>: 液位和温度显示</p>
                <p>⚙️ <strong>泵</strong>: 左侧，转速由流量决定</p>
                <p>🔶 <strong>阀门</strong>: 橙色圆柱体</p>
                <p>⚡ <strong>电机</strong>: 右侧，带动泵运行</p>
              </div>
            </Card>
            <Card title="状态指示" size="small">
              <Space direction="vertical" size={[8, 8]}>
                <Tag color="green">🟢 绿色指示灯: 正常</Tag>
                <Tag color="gold">🟡 黄色指示灯: 警告</Tag>
                <Tag color="red">🔴 红色闪烁: 临界报警</Tag>
              </Space>
            </Card>
            <Card title="操作提示" size="small">
              <div style={{ fontSize: 12, color: '#666' }}>
                <p>🖱️ 鼠标左键拖拽: 旋转视角</p>
                <p>🖱️ 鼠标右键拖拽: 平移</p>
                <p>🖱️ 滚轮: 缩放</p>
              </div>
            </Card>
          </Space>
        </Col>
      </Row>
    </div>
  );
};

export default React.memo(DigitalTwin);
