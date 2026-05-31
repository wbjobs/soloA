"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { FiPlay, FiPause, FiSkipBack, FiSkipForward } from "react-icons/fi";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment } from "@react-three/drei";
import { ReactionDetail, Atom as AtomType, Bond as BondType } from "@/lib/api";
import { Atom } from "@/components/MoleculeViewer/Atom";
import { Bond } from "@/components/MoleculeViewer/Bond";
import { cn } from "@/lib/utils";

interface ReactionViewerProps {
  reaction: ReactionDetail | null;
  className?: string;
}

interface SceneContentProps {
  atoms: AtomType[];
  bonds: BondType[];
  showBondOrder?: boolean;
  atomScale?: number;
}

function SceneContent({ atoms, bonds, showBondOrder = true, atomScale = 1 }: SceneContentProps) {
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 10, 5]} intensity={1} />
      <directionalLight position={[-10, -5, -5]} intensity={0.4} />
      <pointLight position={[0, 5, 0]} intensity={0.5} />

      {bonds.map((bond, i) => (
        <Bond
          key={`bond-${i}`}
          bond={bond}
          atoms={atoms}
          showBondOrder={showBondOrder}
        />
      ))}

      {atoms.map((atom) => (
        <Atom
          key={`atom-${atom.index}`}
          atom={atom}
          scale={atomScale}
        />
      ))}

      <OrbitControls enableDamping dampingFactor={0.05} minDistance={3} maxDistance={50} />
      <Environment preset="city" />
    </>
  );
}

export function ReactionViewer({ reaction, className }: ReactionViewerProps) {
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const animationRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!reaction) return;
    setCurrentFrame(0);
    setIsPlaying(false);
  }, [reaction]);

  useEffect(() => {
    if (!isPlaying || !reaction) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    const frameDuration = 100 / speed;

    const animate = (time: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = time;

      const elapsed = time - lastTimeRef.current;
      if (elapsed >= frameDuration) {
        setCurrentFrame((prev) => {
          const next = prev + 1;
          if (next >= reaction.num_frames) {
            return 0;
          }
          return next;
        });
        lastTimeRef.current = time;
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      lastTimeRef.current = 0;
    };
  }, [isPlaying, reaction, speed]);

  const currentState = useMemo(() => {
    if (!reaction) return null;

    const frame = reaction.frames[currentFrame];
    const totalFrames = reaction.num_frames;
    const transitionStart = Math.floor(totalFrames * 0.25);
    const transitionEnd = Math.floor(totalFrames * 0.75);

    let bonds: BondType[] = [];
    if (currentFrame < transitionStart) {
      bonds = reaction.reactant_coords.bonds;
    } else if (currentFrame > transitionEnd) {
      bonds = reaction.product_coords.bonds;
    } else {
      bonds = reaction.transition_bonds.map((tb) => ({
        begin: tb.begin,
        end: tb.end,
        order: tb.order,
        style: tb.style,
        is_aromatic: tb.is_aromatic,
        is_conjugated: false,
        type: tb.type,
      }));
    }

    return {
      atoms: frame.atoms,
      bonds,
    };
  }, [reaction, currentFrame]);

  const goToStart = () => {
    setCurrentFrame(0);
    setIsPlaying(false);
  };

  const goToEnd = () => {
    if (reaction) {
      setCurrentFrame(reaction.num_frames - 1);
      setIsPlaying(false);
    }
  };

  const togglePlay = () => {
    setIsPlaying((prev) => !prev);
  };

  if (!reaction) {
    return (
      <div className={cn("flex items-center justify-center h-96 bg-gray-50 rounded-xl border border-dashed border-gray-300", className)}>
        <div className="text-center text-gray-500">
          <div className="text-6xl mb-4">⚗️</div>
          <p className="text-lg font-medium">Select a Reaction</p>
          <p className="text-sm mt-1">Choose a predefined reaction or create a custom one</p>
        </div>
      </div>
    );
  }

  const progress = reaction.num_frames > 1 ? (currentFrame / (reaction.num_frames - 1)) * 100 : 0;

  return (
    <div className={cn("relative rounded-xl overflow-hidden border border-gray-200", className)}>
      <div className="absolute top-4 left-4 right-4 z-10 flex justify-between items-start">
        <div className="bg-white rounded-lg shadow-md p-3 max-w-sm">
          <h3 className="font-semibold text-gray-900">{reaction.name}</h3>
          {reaction.equation && (
            <p className="text-sm text-gray-600 mt-1 font-mono">{reaction.equation}</p>
          )}
          <div className="flex gap-3 mt-2 text-xs text-gray-500">
            {reaction.activation_energy !== undefined && (
              <span>Ea: {reaction.activation_energy} kJ/mol</span>
            )}
            {reaction.enthalpy !== undefined && (
              <span>ΔH: {reaction.enthalpy > 0 ? "+" : ""}{reaction.enthalpy} kJ/mol</span>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md px-3 py-2">
          <span className="text-sm font-medium text-gray-700">
            Frame {currentFrame + 1} / {reaction.num_frames}
          </span>
        </div>
      </div>

      <div className="h-96 md:h-[500px]">
        <Canvas
          key={reaction?.id || "empty"}
          camera={{ position: [6, 4, 6], fov: 50 }}
          style={{ background: "#f1f5f9" }}
          gl={{
            antialias: true,
            powerPreference: "high-performance",
          }}
        >
          {currentState && (
            <SceneContent
              key={`scene-${reaction?.id || "empty"}-${currentFrame}`}
              atoms={currentState.atoms}
              bonds={currentState.bonds}
            />
          )}
        </Canvas>
      </div>

      <div className="absolute bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-gray-200 p-4">
        <div className="flex items-center justify-center gap-4 mb-3">
          <button
            onClick={goToStart}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            title="Go to Start"
          >
            <FiSkipBack size={20} className="text-gray-700" />
          </button>

          <button
            onClick={togglePlay}
            className="p-3 rounded-full bg-primary-600 text-white hover:bg-primary-700 transition-colors shadow-md"
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <FiPause size={24} /> : <FiPlay size={24} className="ml-0.5" />}
          </button>

          <button
            onClick={goToEnd}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            title="Go to End"
          >
            <FiSkipForward size={20} className="text-gray-700" />
          </button>
        </div>

        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 w-16">Reactants</span>
            <input
              type="range"
              min={0}
              max={reaction.num_frames - 1}
              value={currentFrame}
              onChange={(e) => {
                setCurrentFrame(parseInt(e.target.value));
                setIsPlaying(false);
              }}
              className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary-600"
            />
            <span className="text-xs text-gray-500 w-16 text-right">Products</span>
          </div>

          <div className="flex items-center justify-center gap-4 mt-3">
            <span className="text-xs text-gray-500">Speed:</span>
            {[0.5, 1, 2, 4].map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={cn(
                  "px-2 py-1 text-xs rounded-md transition-colors",
                  speed === s
                    ? "bg-primary-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                )}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-center gap-6 mt-3">
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-red-500"></div>
            <span className="text-xs text-gray-500">Bond Breaking</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-teal-500"></div>
            <span className="text-xs text-gray-500">Bond Forming</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-gray-400"></div>
            <span className="text-xs text-gray-500">Maintained</span>
          </div>
        </div>
      </div>
    </div>
  );
}
