import { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader';

interface PostProcessingProps {
  enabled?: boolean;
  bloomStrength?: number;
  bloomRadius?: number;
  bloomThreshold?: number;
}

export function PostProcessing({
  enabled = true,
  bloomStrength = 1.5,
  bloomRadius = 0.5,
  bloomThreshold = 0.1
}: PostProcessingProps) {
  const composerRef = useRef<EffectComposer | null>(null);
  const { gl, scene, camera, size } = useThree();

  const composer = useMemo(() => {
    const renderScene = new RenderPass(scene, camera);

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(size.width, size.height),
      bloomStrength,
      bloomRadius,
      bloomThreshold
    );

    const fxaaPass = new ShaderPass(FXAAShader);
    fxaaPass.material.uniforms['resolution'].value.x = 1 / size.width;
    fxaaPass.material.uniforms['resolution'].value.y = 1 / size.height;

    const composer = new EffectComposer(gl);
    composer.addPass(renderScene);
    composer.addPass(bloomPass);
    composer.addPass(fxaaPass);

    return composer;
  }, [gl, scene, camera]);

  useEffect(() => {
    composerRef.current = composer;

    return () => {
      composer.dispose();
    };
  }, [composer]);

  useEffect(() => {
    if (composerRef.current) {
      composerRef.current.setSize(size.width, size.height);
    }
  }, [size]);

  useFrame((_, delta) => {
    if (enabled && composerRef.current) {
      composerRef.current.render(delta);
    }
  }, 1);

  return null;
}
