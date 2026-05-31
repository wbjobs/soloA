import numpy as np
from typing import Dict, List, Any, Optional
from .gates import (
    GATE_REGISTRY, ROTATION_GATES, CONTROLLED_GATES,
    single_qubit_gate, CNOT, Toffoli, rotation_gate
)
from .state import (
    create_initial_state, get_probabilities, get_probability_amplitudes,
    get_bloch_sphere_coordinates
)


class QuantumCircuitSimulator:
    def __init__(self, n_qubits: int):
        if n_qubits < 1 or n_qubits > 5:
            raise ValueError("Number of qubits must be between 1 and 5")
        
        self.n_qubits = n_qubits
        self.state = create_initial_state(n_qubits)
        self.gates: List[Dict[str, Any]] = []
    
    def reset(self):
        self.state = create_initial_state(self.n_qubits)
        self.gates = []
    
    def apply_gate(self, gate_type: str, targets: List[int], params: Optional[Dict[str, Any]] = None):
        params = params or {}
        
        if gate_type in GATE_REGISTRY:
            if len(targets) != 1:
                raise ValueError(f"Single qubit gate {gate_type} requires exactly 1 target qubit")
            
            target = targets[0]
            if target < 0 or target >= self.n_qubits:
                raise ValueError(f"Target qubit {target} is out of range")
            
            gate_matrix = single_qubit_gate(GATE_REGISTRY[gate_type], target, self.n_qubits)
            self.state = gate_matrix @ self.state
            
            self.gates.append({
                'type': gate_type,
                'targets': targets,
                'params': params
            })
        
        elif gate_type in ROTATION_GATES:
            if len(targets) != 1:
                raise ValueError(f"Rotation gate {gate_type} requires exactly 1 target qubit")
            
            target = targets[0]
            if target < 0 or target >= self.n_qubits:
                raise ValueError(f"Target qubit {target} is out of range")
            
            angle = params.get('angle', 0)
            axis = gate_type[1].lower()
            
            rot_gate = rotation_gate(axis, angle)
            gate_matrix = single_qubit_gate(rot_gate, target, self.n_qubits)
            self.state = gate_matrix @ self.state
            
            self.gates.append({
                'type': gate_type,
                'targets': targets,
                'params': params
            })
        
        elif gate_type == 'CNOT':
            if len(targets) != 2:
                raise ValueError("CNOT gate requires exactly 2 qubits: [control, target]")
            
            control, target = targets[0], targets[1]
            if control < 0 or control >= self.n_qubits:
                raise ValueError(f"Control qubit {control} is out of range")
            if target < 0 or target >= self.n_qubits:
                raise ValueError(f"Target qubit {target} is out of range")
            if control == target:
                raise ValueError("Control and target qubits must be different")
            
            gate_matrix = CNOT(control, target, self.n_qubits)
            self.state = gate_matrix @ self.state
            
            self.gates.append({
                'type': 'CNOT',
                'targets': [control, target],
                'params': {}
            })
        
        elif gate_type == 'TOFFOLI':
            if len(targets) != 3:
                raise ValueError("TOFFOLI gate requires exactly 3 qubits: [control1, control2, target]")
            
            c1, c2, t = targets[0], targets[1], targets[2]
            if any(q < 0 or q >= self.n_qubits for q in targets):
                raise ValueError("Qubit index out of range")
            if len(set(targets)) != 3:
                raise ValueError("All qubit indices must be distinct")
            
            gate_matrix = Toffoli(c1, c2, t, self.n_qubits)
            self.state = gate_matrix @ self.state
            
            self.gates.append({
                'type': 'TOFFOLI',
                'targets': targets,
                'params': {}
            })
        
        else:
            raise ValueError(f"Unknown gate type: {gate_type}")
    
    def apply_circuit(self, gates: List[Dict[str, Any]]):
        for gate in gates:
            self.apply_gate(
                gate.get('type'),
                gate.get('targets', []),
                gate.get('params', {})
            )
    
    def get_results(self) -> Dict[str, Any]:
        norm = np.linalg.norm(self.state)
        if norm > 1e-10:
            normalized_state = self.state / norm
        else:
            normalized_state = self.state.copy()
        
        probabilities = get_probabilities(normalized_state)
        amplitudes = get_probability_amplitudes(normalized_state)
        
        bloch_spheres = {}
        for qubit_idx in range(self.n_qubits):
            bloch_spheres[f'q{qubit_idx}'] = get_bloch_sphere_coordinates(
                normalized_state, qubit_idx
            )
        
        return {
            'n_qubits': self.n_qubits,
            'state_vector': {
                'real': [float(np.real(x)) for x in normalized_state],
                'imag': [float(np.imag(x)) for x in normalized_state]
            },
            'probabilities': probabilities,
            'amplitudes': amplitudes,
            'bloch_spheres': bloch_spheres,
            'gates': self.gates
        }
