from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import json
import os
from datetime import datetime

from quantum_simulator import (
    QuantumCircuitSimulator,
    get_optimization_suggestions,
    optimize_circuit,
    generate_latex_both
)

app = FastAPI(title="Quantum Circuit Simulator API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

STORAGE_DIR = os.path.join(os.path.dirname(__file__), "storage")
CIRCUITS_FILE = os.path.join(STORAGE_DIR, "circuits.json")

os.makedirs(STORAGE_DIR, exist_ok=True)
if not os.path.exists(CIRCUITS_FILE):
    with open(CIRCUITS_FILE, "w") as f:
        json.dump([], f)


class GateModel(BaseModel):
    type: str
    targets: List[int]
    params: Optional[Dict[str, Any]] = {}


class CircuitModel(BaseModel):
    n_qubits: int
    gates: List[GateModel]


class SaveCircuitModel(BaseModel):
    name: str
    n_qubits: int
    gates: List[GateModel]


class LoadCircuitResponse(BaseModel):
    id: str
    name: str
    n_qubits: int
    gates: List[GateModel]
    created_at: str


def load_saved_circuits() -> List[Dict[str, Any]]:
    try:
        with open(CIRCUITS_FILE, "r") as f:
            return json.load(f)
    except Exception:
        return []


def save_circuits(circuits: List[Dict[str, Any]]):
    with open(CIRCUITS_FILE, "w") as f:
        json.dump(circuits, f, indent=2)


@app.get("/")
async def root():
    return {"message": "Quantum Circuit Simulator API is running"}


@app.post("/api/simulate")
async def simulate_circuit(circuit: CircuitModel):
    try:
        simulator = QuantumCircuitSimulator(circuit.n_qubits)
        
        for gate in circuit.gates:
            simulator.apply_gate(
                gate.type,
                gate.targets,
                gate.params
            )
        
        results = simulator.get_results()
        return {"success": True, "data": results}
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/gates")
async def get_available_gates():
    return {
        "single_qubit": ["H", "X", "Y", "Z", "S", "T", "I", "Rx", "Ry", "Rz"],
        "multi_qubit": ["CNOT", "TOFFOLI"],
        "rotations": {
            "Rx": {"name": "Rotation X", "param": "angle (radians)"},
            "Ry": {"name": "Rotation Y", "param": "angle (radians)"},
            "Rz": {"name": "Rotation Z", "param": "angle (radians)"}
        }
    }


@app.post("/api/circuits")
async def save_circuit(circuit: SaveCircuitModel):
    try:
        circuits = load_saved_circuits()
        
        circuit_id = f"circuit_{len(circuits) + 1}_{int(datetime.now().timestamp())}"
        
        new_circuit = {
            "id": circuit_id,
            "name": circuit.name,
            "n_qubits": circuit.n_qubits,
            "gates": [
                {"type": g.type, "targets": g.targets, "params": g.params}
                for g in circuit.gates
            ],
            "created_at": datetime.now().isoformat()
        }
        
        circuits.append(new_circuit)
        save_circuits(circuits)
        
        return {"success": True, "id": circuit_id, "message": "Circuit saved successfully"}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/circuits")
async def list_circuits():
    try:
        circuits = load_saved_circuits()
        return {"success": True, "data": circuits}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/circuits/{circuit_id}")
async def get_circuit(circuit_id: str):
    try:
        circuits = load_saved_circuits()
        
        for circuit in circuits:
            if circuit["id"] == circuit_id:
                return {"success": True, "data": circuit}
        
        raise HTTPException(status_code=404, detail="Circuit not found")
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/circuits/{circuit_id}")
async def delete_circuit(circuit_id: str):
    try:
        circuits = load_saved_circuits()
        
        filtered = [c for c in circuits if c["id"] != circuit_id]
        
        if len(filtered) == len(circuits):
            raise HTTPException(status_code=404, detail="Circuit not found")
        
        save_circuits(filtered)
        return {"success": True, "message": "Circuit deleted successfully"}
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/optimize")
async def optimize_circuit_endpoint(circuit: CircuitModel):
    try:
        gates_list = [
            {"type": g.type, "targets": g.targets, "params": g.params}
            for g in circuit.gates
        ]
        
        result = get_optimization_suggestions(gates_list, circuit.n_qubits)
        
        return {"success": True, "data": result}
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/export/latex")
async def export_latex(circuit: CircuitModel):
    try:
        gates_list = [
            {"type": g.type, "targets": g.targets, "params": g.params}
            for g in circuit.gates
        ]
        
        latex_code = generate_latex_both(gates_list, circuit.n_qubits)
        
        return {
            "success": True,
            "data": latex_code,
            "n_qubits": circuit.n_qubits,
            "gate_count": len(gates_list)
        }
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
