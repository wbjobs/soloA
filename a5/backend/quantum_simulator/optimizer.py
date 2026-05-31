from typing import Dict, List, Any, Tuple
import copy


SELF_INVERSE_GATES = ['H', 'X', 'Y', 'Z', 'CNOT', 'TOFFOLI']
IDENTITY_GATES = ['I']
ROTATION_GATES = ['Rx', 'Ry', 'Rz']


def gates_are_equal(gate1: Dict[str, Any], gate2: Dict[str, Any]) -> bool:
    if gate1['type'] != gate2['type']:
        return False
    if gate1['targets'] != gate2['targets']:
        return False
    if gate1.get('params', {}) != gate2.get('params', {}):
        return False
    return True


def is_zero_rotation(gate: Dict[str, Any]) -> bool:
    if gate['type'] not in ROTATION_GATES:
        return False
    angle = gate.get('params', {}).get('angle', 0)
    return abs(angle) < 1e-10


def is_identity_gate(gate: Dict[str, Any]) -> bool:
    if gate['type'] in IDENTITY_GATES:
        return True
    if is_zero_rotation(gate):
        return True
    return False


def are_self_inverse_pair(gate1: Dict[str, Any], gate2: Dict[str, Any]) -> bool:
    if gate1['type'] not in SELF_INVERSE_GATES:
        return False
    if gate1['type'] != gate2['type']:
        return False
    if gate1['targets'] != gate2['targets']:
        return False
    return True


def can_merge_rotations(gate1: Dict[str, Any], gate2: Dict[str, Any]) -> Tuple[bool, Dict[str, Any]]:
    if gate1['type'] != gate2['type']:
        return False, {}
    if gate1['type'] not in ROTATION_GATES:
        return False, {}
    if gate1['targets'] != gate2['targets']:
        return False, {}
    
    angle1 = gate1.get('params', {}).get('angle', 0)
    angle2 = gate2.get('params', {}).get('angle', 0)
    total_angle = angle1 + angle2
    
    if abs(total_angle) < 1e-10:
        return True, {
            'type': gate1['type'],
            'targets': gate1['targets'].copy(),
            'params': {'angle': 0},
            '_is_identity': True
        }
    
    while total_angle > 2 * 3.14159265359:
        total_angle -= 2 * 3.14159265359
    while total_angle < -2 * 3.14159265359:
        total_angle += 2 * 3.14159265359
    
    return True, {
        'type': gate1['type'],
        'targets': gate1['targets'].copy(),
        'params': {'angle': total_angle}
    }


def optimize_circuit(gates: List[Dict[str, Any]], n_qubits: int) -> Dict[str, Any]:
    optimized_gates = []
    changes = []
    original_count = len(gates)
    
    i = 0
    while i < len(gates):
        current_gate = gates[i]
        
        if is_identity_gate(current_gate):
            reason = f"Removed identity gate {current_gate['type']} at position {i}"
            if current_gate.get('params', {}).get('angle') == 0 and current_gate['type'] in ROTATION_GATES:
                reason = f"Removed zero-angle rotation {current_gate['type']}(0) at position {i}"
            changes.append({
                'type': 'remove_identity',
                'position': i,
                'gate': copy.deepcopy(current_gate),
                'reason': reason
            })
            i += 1
            continue
        
        if i + 1 < len(gates):
            next_gate = gates[i + 1]
            
            if are_self_inverse_pair(current_gate, next_gate):
                changes.append({
                    'type': 'cancel_pair',
                    'position': i,
                    'gate1': copy.deepcopy(current_gate),
                    'gate2': copy.deepcopy(next_gate),
                    'reason': f"Removed self-inverse pair {current_gate['type']}*{current_gate['type']} at positions {i} and {i+1}"
                })
                i += 2
                continue
            
            can_merge, merged = can_merge_rotations(current_gate, next_gate)
            if can_merge:
                if merged.get('_is_identity', False):
                    changes.append({
                        'type': 'merge_to_identity',
                        'position': i,
                        'gate1': copy.deepcopy(current_gate),
                        'gate2': copy.deepcopy(next_gate),
                        'reason': f"Merged rotations {current_gate['type']} and {next_gate['type']} to identity at positions {i} and {i+1}"
                    })
                    i += 2
                    continue
                else:
                    optimized_gates.append(merged)
                    changes.append({
                        'type': 'merge',
                        'position': i,
                        'gate1': copy.deepcopy(current_gate),
                        'gate2': copy.deepcopy(next_gate),
                        'merged_gate': copy.deepcopy(merged),
                        'reason': f"Merged rotations {current_gate['type']} and {next_gate['type']} at positions {i} and {i+1}"
                    })
                    i += 2
                    continue
        
        optimized_gates.append(copy.deepcopy(current_gate))
        i += 1
    
    optimized_count = len(optimized_gates)
    
    return {
        'original_gates': gates,
        'optimized_gates': optimized_gates,
        'n_qubits': n_qubits,
        'original_count': original_count,
        'optimized_count': optimized_count,
        'gates_removed': original_count - optimized_count,
        'changes': changes
    }


def get_optimization_suggestions(gates: List[Dict[str, Any]], n_qubits: int) -> Dict[str, Any]:
    suggestions = []
    
    for i, gate in enumerate(gates):
        if is_identity_gate(gate):
            if gate['type'] == 'I':
                suggestions.append({
                    'type': 'remove_identity',
                    'position': i,
                    'gate': copy.deepcopy(gate),
                    'message': f"第 {i+1} 个门是恒等门 I，可以移除",
                    'priority': 'high'
                })
            elif is_zero_rotation(gate):
                suggestions.append({
                    'type': 'remove_zero_rotation',
                    'position': i,
                    'gate': copy.deepcopy(gate),
                    'message': f"第 {i+1} 个门 {gate['type']}(0) 是零角度旋转，可以移除",
                    'priority': 'high'
                })
    
    for i in range(len(gates) - 1):
        gate1 = gates[i]
        gate2 = gates[i + 1]
        
        if are_self_inverse_pair(gate1, gate2):
            suggestions.append({
                'type': 'cancel_pair',
                'position': i,
                'gate1': copy.deepcopy(gate1),
                'gate2': copy.deepcopy(gate2),
                'message': f"第 {i+1}-{i+2} 个门是自逆对 {gate1['type']}*{gate1['type']}，可以抵消为恒等操作",
                'priority': 'high'
            })
        
        can_merge, _ = can_merge_rotations(gate1, gate2)
        if can_merge:
            suggestions.append({
                'type': 'merge_rotations',
                'position': i,
                'gate1': copy.deepcopy(gate1),
                'gate2': copy.deepcopy(gate2),
                'message': f"第 {i+1}-{i+2} 个门 {gate1['type']} 和 {gate2['type']} 可以合并",
                'priority': 'medium'
            })
    
    result = optimize_circuit(gates, n_qubits)
    
    return {
        'suggestions': suggestions,
        'optimization_result': result,
        'summary': {
            'original_count': len(gates),
            'optimized_count': result['optimized_count'],
            'savings': len(gates) - result['optimized_count'],
            'savings_percent': round((len(gates) - result['optimized_count']) / max(len(gates), 1) * 100, 2) if gates else 0
        }
    }
