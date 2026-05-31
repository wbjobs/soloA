"use client";

import { useState } from "react";
import { FiSearch, FiLoader, FiCheck, FiX } from "react-icons/fi";
import { moleculesApi } from "@/lib/api";
import { MoleculeData } from "@/lib/api";
import { EXAMPLE_SMILES, cn } from "@/lib/utils";

interface SmilesInputProps {
  onMoleculeParsed: (molecule: MoleculeData) => void;
  className?: string;
}

type ValidationState = "idle" | "validating" | "valid" | "invalid";

export function SmilesInput({ onMoleculeParsed, className }: SmilesInputProps) {
  const [smiles, setSmiles] = useState("");
  const [validationState, setValidationState] = useState<ValidationState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [includeHs, setIncludeHs] = useState(true);

  const validateSmiles = async (value: string) => {
    if (!value.trim()) {
      setValidationState("idle");
      setErrorMessage("");
      return;
    }

    setValidationState("validating");

    try {
      const response = await moleculesApi.validate(value);
      if (response.data.valid) {
        setValidationState("valid");
        setErrorMessage("");
      } else {
        setValidationState("invalid");
        setErrorMessage(response.data.error || "Invalid SMILES string");
      }
    } catch {
      setValidationState("invalid");
      setErrorMessage("Validation failed");
    }
  };

  const handleParse = async () => {
    if (!smiles.trim() || validationState === "invalid") return;

    setIsParsing(true);
    try {
      const response = await moleculesApi.parse(smiles.trim(), includeHs);
      onMoleculeParsed(response.data);
    } catch (error: any) {
      setErrorMessage(error.response?.data?.detail || "Failed to parse molecule");
      setValidationState("invalid");
    } finally {
      setIsParsing(false);
    }
  };

  const handleExampleClick = async (exampleSmiles: string) => {
    setSmiles(exampleSmiles);
    setValidationState("validating");
    setErrorMessage("");

    try {
      const response = await moleculesApi.parse(exampleSmiles, includeHs);
      setValidationState("valid");
      onMoleculeParsed(response.data);
    } catch (error: any) {
      setErrorMessage(error.response?.data?.detail || "Failed to parse molecule");
      setValidationState("invalid");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleParse();
    }
  };

  return (
    <div className={cn("space-y-4", className)}>
      <div className="card">
        <h3 className="section-title">SMILES Input</h3>

        <div className="space-y-4">
          <div>
            <label className="label">SMILES String</label>
            <div className="relative">
              <input
                type="text"
                value={smiles}
                onChange={(e) => {
                  setSmiles(e.target.value);
                  if (validationState !== "idle") {
                    validateSmiles(e.target.value);
                  }
                }}
                onBlur={(e) => validateSmiles(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="e.g., CCO (ethanol), c1ccccc1 (benzene)"
                className={cn(
                  "input-field pr-12",
                  validationState === "valid" && "border-green-400 focus:ring-green-500",
                  validationState === "invalid" && "border-red-400 focus:ring-red-500"
                )}
                disabled={isParsing}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {validationState === "validating" || isParsing ? (
                  <FiLoader className="animate-spin text-gray-400" size={18} />
                ) : validationState === "valid" ? (
                  <FiCheck className="text-green-500" size={18} />
                ) : validationState === "invalid" ? (
                  <FiX className="text-red-500" size={18} />
                ) : null}
              </div>
            </div>

            {errorMessage && (
              <p className="text-sm text-red-500 mt-1">{errorMessage}</p>
            )}
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeHs}
                onChange={(e) => setIncludeHs(e.target.checked)}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700">Show Hydrogen Atoms</span>
            </label>
          </div>

          <button
            onClick={handleParse}
            disabled={!smiles.trim() || validationState === "invalid" || isParsing}
            className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isParsing ? (
              <>
                <FiLoader className="animate-spin" size={18} />
                Parsing...
              </>
            ) : (
              <>
                <FiSearch size={18} />
                Visualize Molecule
              </>
            )}
          </button>
        </div>
      </div>

      <div className="card">
        <h3 className="section-title">Quick Examples</h3>
        <div className="grid grid-cols-2 gap-2">
          {EXAMPLE_SMILES.map((example) => (
            <button
              key={example.smiles}
              onClick={() => handleExampleClick(example.smiles)}
              className="p-3 text-left rounded-lg border border-gray-200 hover:border-primary-400 hover:bg-primary-50 transition-colors group"
            >
              <span className="font-medium text-gray-900 group-hover:text-primary-700">
                {example.name}
              </span>
              <p className="text-xs text-gray-500 font-mono mt-0.5 truncate">
                {example.smiles}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
