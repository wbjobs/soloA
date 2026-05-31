import numpy as np
from typing import Dict

H = np.array([
    [1, 1],
    [1, -1]
], dtype=np.complex128) / np.sqrt(2)

X = np.array([
    [0, 1],
    [1, 0]
], dtype=np.complex128)

Y = np.array([
    [0, -1j],
    [1j, 0]
], dtype=np.complex128)

Z = np.array([
    [1, 0],
    [0, -1]
], dtype=np.complex128)

S = np.array([
    [1, 0],
    [0, 1j]
], dtype=np.complex128)

T = np.array([
    [1, 0],
    [0, np.exp(1j * np.pi / 4)]
], dtype=np.complex128)

I = np.eye(2, dtype=np.complex128)

SWAP = np.array([
    [1, 0, 0, 0],
    [0, 0, 1, 0],
    [0, 1, 0, 0],
    [0, 0, 0, 1]
], dtype=np.complex128)

def CNOT(control: int, target: int, n_qubits: int) -> np.ndarray:
    matrix = np.zeros((2**n_qubits, 2**n_qubits), dtype=np.complex128)
    
    for i in range(2**n_qubits):
        binary = format(i, f'0{n_qubits}b')
        control_bit = int(binary[control])
        
        if control_bit == 1:
            new_binary = list(binary)
            new_binary[target] = '1' if new_binary[target] == '0' else '0'
            new_i = int(''.join(new_binary), 2)
            matrix[new_i, i] = 1
        else:
            matrix[i, i] = 1
    
    return matrix

def Toffoli(control1: int, control2: int, target: int, n_qubits: int) -> np.ndarray:
    matrix = np.zeros((2**n_qubits, 2**n_qubits), dtype=np.complex128)
    
    for i in range(2**n_qubits):
        binary = format(i, f'0{n_qubits}b')
        c1 = int(binary[control1])
        c2 = int(binary[control2])
        
        if c1 == 1 and c2 == 1:
            new_binary = list(binary)
            new_binary[target] = '1' if new_binary[target] == '0' else '0'
            new_i = int(''.join(new_binary), 2)
            matrix[new_i, i] = 1
        else:
            matrix[i, i] = 1
    
    return matrix

def single_qubit_gate(gate: np.ndarray, target_qubit: int, n_qubits: int) -> np.ndarray:
    operators = [I] * n_qubits
    operators[target_qubit] = gate
    
    result = operators[0]
    for op in operators[1:]:
        result = np.kron(result, op)
    
    return result

def rotation_gate(axis: str, angle: float) -> np.ndarray:
    if axis == 'x':
        return np.array([
            [np.cos(angle / 2), -1j * np.sin(angle / 2)],
            [-1j * np.sin(angle / 2), np.cos(angle / 2)]
        ], dtype=np.complex128)
    elif axis == 'y':
        return np.array([
            [np.cos(angle / 2), -np.sin(angle / 2)],
            [np.sin(angle / 2), np.cos(angle / 2)]
        ], dtype=np.complex128)
    elif axis == 'z':
        return np.array([
            [np.exp(-1j * angle / 2), 0],
            [0, np.exp(1j * angle / 2)]
        ], dtype=np.complex128)
    else:
        raise ValueError(f"Unknown axis: {axis}")

GATE_REGISTRY: Dict[str, np.ndarray] = {
    'H': H,
    'X': X,
    'Y': Y,
    'Z': Z,
    'S': S,
    'T': T,
    'I': I
}

ROTATION_GATES = ['Rx', 'Ry', 'Rz']
CONTROLLED_GATES = ['CNOT', 'TOFFOLI']
