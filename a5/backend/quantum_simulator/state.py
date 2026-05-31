import numpy as np
from typing import Dict, List, Tuple


def create_initial_state(n_qubits: int) -> np.ndarray:
    state = np.zeros(2**n_qubits, dtype=np.complex128)
    state[0] = 1
    return state


def get_basis_labels(n_qubits: int) -> List[str]:
    return [format(i, f'0{n_qubits}b') for i in range(2**n_qubits)]


def get_probabilities(state: np.ndarray) -> Dict[str, float]:
    n_qubits = int(np.log2(len(state)))
    labels = get_basis_labels(n_qubits)
    probs = np.abs(state)**2
    return {label: float(prob) for label, prob in zip(labels, probs)}


def get_probability_amplitudes(state: np.ndarray) -> Dict[str, Dict[str, float]]:
    n_qubits = int(np.log2(len(state)))
    labels = get_basis_labels(n_qubits)
    
    amplitudes = {}
    for label, amp in zip(labels, state):
        amplitudes[label] = {
            'real': float(np.real(amp)),
            'imag': float(np.imag(amp)),
            'magnitude': float(np.abs(amp)),
            'phase': float(np.angle(amp))
        }
    
    return amplitudes


def get_single_qubit_state(state: np.ndarray, qubit_index: int) -> Tuple[np.ndarray, float]:
    n_qubits = int(np.log2(len(state)))
    
    reduced_density = np.zeros((2, 2), dtype=np.complex128)
    
    for i in range(2**n_qubits):
        binary = format(i, f'0{n_qubits}b')
        qubit_val = int(binary[qubit_index])
        
        for j in range(2**n_qubits):
            binary_j = format(j, f'0{n_qubits}b')
            qubit_val_j = int(binary_j[qubit_index])
            
            if qubit_val == qubit_val_j:
                if all(binary[k] == binary_j[k] for k in range(n_qubits) if k != qubit_index):
                    reduced_density[qubit_val, qubit_val_j] += state[i] * np.conj(state[j])
    
    trace = np.trace(reduced_density)
    if np.abs(trace) > 1e-10:
        reduced_density = reduced_density / trace
    
    eigenvalues, eigenvectors = np.linalg.eigh(reduced_density)
    max_idx = np.argmax(eigenvalues)
    pure_state = eigenvectors[:, max_idx]
    
    alpha = pure_state[0]
    beta = pure_state[1]
    
    norm = np.sqrt(np.abs(alpha)**2 + np.abs(beta)**2)
    if norm > 1e-10:
        alpha /= norm
        beta /= norm
    else:
        alpha = 1.0 + 0j
        beta = 0.0 + 0j
    
    theta = 2 * np.arccos(np.clip(np.abs(alpha), 0, 1))
    
    phi = 0.0
    if np.abs(alpha) > 1e-10 and np.abs(beta) > 1e-10:
        phi = np.angle(beta) - np.angle(alpha)
    
    single_qubit_state = np.array([alpha, beta], dtype=np.complex128)
    
    return single_qubit_state, theta


def get_bloch_sphere_coordinates(state: np.ndarray, qubit_index: int) -> Dict[str, float]:
    n_qubits = int(np.log2(len(state)))
    if n_qubits == 1:
        alpha = state[0]
        beta = state[1]
        
        norm = np.sqrt(np.abs(alpha)**2 + np.abs(beta)**2)
        if norm > 1e-10:
            alpha /= norm
            beta /= norm
    else:
        single_qubit_state, _ = get_single_qubit_state(state, qubit_index)
        alpha = single_qubit_state[0]
        beta = single_qubit_state[1]
    
    theta = 2 * np.arccos(np.clip(np.abs(alpha), 0, 1))
    
    phi = 0.0
    if np.abs(alpha) > 1e-10 and np.abs(beta) > 1e-10:
        phi = np.angle(beta) - np.angle(alpha)
    
    x = np.sin(theta) * np.cos(phi)
    y = np.sin(theta) * np.sin(phi)
    z = np.cos(theta)
    
    return {
        'x': float(x),
        'y': float(y),
        'z': float(z),
        'theta': float(theta),
        'phi': float(phi)
    }
